"""
Mem0内存服务模块 - 提供记忆存储和检索功能
"""
import logging
import os
import concurrent.futures
import traceback
import os
import logging
import concurrent.futures

# 导入dotenv加载.env文件
from dotenv import load_dotenv

# 加载.env文件中的环境变量
load_dotenv()

from mem0 import Memory
from mem0.proxy.main import Mem0
from django.core.cache import cache

# 尝试导入 Qdrant 客户端
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    logging.warning("Qdrant client not available. Please install with: pip install qdrant-client")

# 初始化日志记录器
logger = logging.getLogger(__name__)

# 初始化线程池执行器用于异步内存操作
memory_executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)

# Mem0 API密钥（从环境变量获取）
MEM0_API_KEY = os.environ.get("MEM0_API_KEY", "")

# 确保设置 OpenAI API 密钥（从.env文件加载）
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_API_KEY:
    logger.warning("未找到OPENAI_API_KEY环境变量，请确保.env文件包含此密钥")
os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY

# Qdrant configuration using local hardcoded values: localhost:6333

# Mem0 配置
MEM0_CONFIG = {
    "embedding_model": {
        "model": "openai/text-embedding-3-small",
        "config": {
            "api_key": OPENAI_API_KEY
        }
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333,
            "collection_name": "deja_vocab_memories"
        }
    },
    "llm": {
        "model": "openai/gpt-4o-mini",
        "config": {
            "api_key": OPENAI_API_KEY,
            "temperature": 0.2,
            "max_tokens": 1500
        }
    },
    "memory_categories": [
        "general_conversation",
        "vocabulary_learning",
        "grammar_questions",
        "pronunciation_concerns",
        "learning_preferences",
        "personal_information",
        "video_content"
    ],
    "store_all": True,  # Force storing all interactions, regardless of content complexity
    "memory_threshold": 0.1  # Set a very low threshold to ensure most memories are stored
}

# Default setting for memory mode - set to False by default
MEMORY_MODE_ENABLED = False

def get_memory_mode_enabled():
    """
    Get the current memory mode status.
    Returns:
        bool: True if memory mode is enabled, False otherwise
    """
    global MEMORY_MODE_ENABLED
    return MEMORY_MODE_ENABLED

def set_memory_mode_enabled(user_id, enabled):
    """
    Set the memory mode status for a specific user and update the global status.
    
    Args:
        user_id (int): The ID of the user
        enabled (bool): Whether memory mode should be enabled
        
    Returns:
        bool: The new memory mode status
    """
    global MEMORY_MODE_ENABLED
    
    # Update global variable
    MEMORY_MODE_ENABLED = enabled
    
    # Update cache for user
    cache_key = f'memory_mode_status_{user_id}'
    cache.set(cache_key, enabled, timeout=86400 * 30)  # Cache for 30 days
    
    logger.info(f"记忆模式状态更新为: {enabled}")
    return enabled

def get_user_memory_mode_status(user_id):
    """
    Get the memory mode status for a specific user.
    If not found in cache, return the global status.
    
    Args:
        user_id (int): The ID of the user
        
    Returns:
        bool: Whether memory mode is enabled for the user
    """
    # Try to get from user-specific cache
    cache_key = f'memory_mode_status_{user_id}'
    is_enabled = cache.get(cache_key)
    
    # If not in cache, use global status and update cache
    if is_enabled is None:
        is_enabled = get_memory_mode_enabled()
        cache.set(cache_key, is_enabled, timeout=86400 * 30)
    
    return is_enabled

def initialize_memory():
    """初始化内存系统"""
    global MEMORY_MODE_ENABLED
    
    # 记录当前记忆模式状态，但无论如何都进行初始化
    memory_status = "enabled" if MEMORY_MODE_ENABLED else "disabled"
    logger.info(f"Initializing memory system (Memory mode is currently {memory_status})")
    
    try:
        # 如果有MEM0_API_KEY，使用API方式初始化
        if MEM0_API_KEY:
            memory = Mem0(api_key=MEM0_API_KEY)
            logger.info("Mem0 memory layer initialized with API key")
        else:
            # 否则使用本地配置
            # 先初始化Qdrant集合，确保使用正确的向量维度
            if QDRANT_AVAILABLE:
                try:
                    # 初始化Qdrant客户端
                    qdrant_client = QdrantClient(
                        host=MEM0_CONFIG["vector_store"]["config"]["host"],
                        port=MEM0_CONFIG["vector_store"]["config"]["port"]
                    )
                    collection_name = "deja_vocab_memories"  # 使用固定名称
                    
                    # 检查集合是否存在
                    collections = qdrant_client.get_collections().collections
                    collection_names = [collection.name for collection in collections]
                    
                    # 只在集合不存在时创建它
                    if collection_name not in collection_names:
                        try:
                            logger.info(f"创建Qdrant集合: {collection_name}，向量维度: 1536")
                            qdrant_client.create_collection(
                                collection_name=collection_name,
                                vectors_config=models.VectorParams(
                                    size=1536,  # OpenAI text-embedding-3-small的向量维度
                                    distance=models.Distance.COSINE
                                )
                            )
                            logger.info(f"成功创建Qdrant集合: {collection_name}")
                        except Exception as create_error:
                            # 捕获特定的"文件已存在"错误，并尝试恢复
                            if "File exists (os error 17)" in str(create_error):
                                logger.warning(f"检测到集合目录已存在但集合未在元数据中注册: {collection_name}")
                                logger.warning("尝试使用已存在的集合或重新打开它...")
                                
                                try:
                                    # 尝试获取集合信息 - 如果成功，集合实际上是可用的
                                    qdrant_client.get_collection(collection_name=collection_name)
                                    logger.info(f"成功恢复对集合的访问: {collection_name}")
                                except:
                                    # 如果仍然失败，记录详细错误，但继续执行
                                    logger.error(f"无法访问或创建集合: {collection_name}")
                                    logger.error(f"原始错误: {str(create_error)}")
                                    logger.error("将继续初始化其他组件，但向量存储功能可能不可用")
                            else:
                                # 其他类型的错误
                                raise create_error
                    else:
                        logger.info(f"Qdrant集合 {collection_name} 已存在，跳过创建")
                    
                    # 更新MEM0_CONFIG中的集合名称
                    MEM0_CONFIG["vector_store"]["config"]["collection_name"] = collection_name
                    
                except Exception as e:
                    logger.error(f"初始化Qdrant集合时出错: {str(e)}")
            
            memory = Memory.from_config(MEM0_CONFIG)
            logger.info("Mem0 memory layer initialized with local config")
            
        # 返回初始化后的memory实例，确保在模块间共享
        return memory
    except Exception as e:
        logger.error(f"Error initializing memory layer: {str(e)}")
        logger.error(traceback.format_exc())
        return None

# 确保初始化memory实例
get_memory = initialize_memory()

def get_memory_instance():
    """获取全局内存实例"""
    if get_memory is None:
        return initialize_memory()
    return get_memory

def add_memory(user_message, user_id, youtube_video_id=None, youtube_video_title=None, assistant_message=None, memory_category="general_conversation"):
    """
    Add user-assistant interaction to memory
    
    Args:
        user_message: The message from the user
        user_id: User identifier 
        youtube_video_id: Optional YouTube video ID if watching a video
        youtube_video_title: Optional YouTube video title
        assistant_message: Assistant's response message
        memory_category: Category for the memory, defaults to general conversation
    
    Returns:
        Result of memory addition operation or None if it fails
    """
    # 如果记忆模式被关闭，则不添加记忆
    global MEMORY_MODE_ENABLED
    if not MEMORY_MODE_ENABLED:
        logger.info("记忆模式已关闭，跳过记忆添加")
        return None
        
    memory = get_memory_instance()
    if memory is None:
        logger.warning("Memory layer not initialized, skipping memory add")
        return None
    
    try:
        # 准备元数据
        memory_metadata = {"category": memory_category}
        
        # 如果有YouTube视频ID和标题，加入元数据
        if youtube_video_id:
            memory_metadata["youtube_video_id"] = youtube_video_id
        if youtube_video_title:
            memory_metadata["youtube_video_title"] = youtube_video_title
        
        # 记录日志
        logger.info(f"准备添加用户记忆，用户: {user_id}, 类别: {memory_category}")
        logger.info(f"用户消息: {user_message}")
        logger.info(f"记忆元数据: {memory_metadata}")
        
        # 创建记忆消息列表
        memory_messages = [
            {"role": "user", "content": user_message}
        ]
        
        # 如果有AI助手回复，也加入记忆
        if assistant_message:
            memory_messages.append({"role": "assistant", "content": assistant_message})
        
        # 添加记忆
        add_result = memory.add(
            messages=memory_messages,
            user_id=str(user_id), 
            metadata=memory_metadata
        )
        
        logger.info(f"记忆添加结果: {add_result}")
        return add_result
    except Exception as e:
        logger.error(f"Error adding memory: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def retrieve_memories(query, user_id, limit=5, memory_categories=None, youtube_video_id=None):
    """检索记忆"""
    # 如果记忆模式被关闭，则不检索记忆
    global MEMORY_MODE_ENABLED
    if not MEMORY_MODE_ENABLED:
        logger.info("记忆模式已关闭，跳过记忆检索")
        return []
        
    memory = get_memory_instance()
    if memory is None:
        logger.warning("Memory layer not initialized, skipping memory retrieval")
        return []
    
    try:
        # 准备过滤条件
        filters = {"user_id": str(user_id)}
        
        # 如果指定了记忆类别，添加到过滤条件
        if memory_categories:
            filters["category"] = {"$in": memory_categories}
        
        # 如果指定了YouTube视频ID，添加到过滤条件
        if youtube_video_id:
            filters["youtube_video_id"] = youtube_video_id
        
        # 检索记忆
        memories = memory.search(
            query=query,
            limit=limit,
            filters=filters
        )
        
        return memories
    except Exception as e:
        logger.error(f"Error retrieving memories: {str(e)}")
        logger.error(traceback.format_exc())
        return []

def get_memory_category(user_message, video_title=None):
    """
    使用更精确的分类逻辑确定记忆类别
    """
    # 如果内容很短或为空，使用默认类别
    if not user_message or len(user_message.strip()) < 3:
        return "general_conversation"
    
    # 可用的记忆类别
    available_categories = [
        "video_content", 
        "vocabulary_learning", 
        "grammar_questions", 
        "pronunciation_concerns", 
        "learning_preferences", 
        "personal_information", 
        "general_conversation"
    ]
    
    # 明确的视频内容匹配
    if video_title and any(phrase in user_message.lower() for phrase in ['this video', 'the video', 'watching']):
        return "video_content"
    
    # 使用OpenAI模型进行更智能的分类
    try:
        from openai import OpenAI
        
        # 准备分类提示
        categories_text = "\n".join([f"{k}: {''}" for k in available_categories])
        
        prompt = f"""
        将以下用户消息分类到最合适的类别中。如果没有明确匹配，则分类为"general_conversation"。

        可用类别:
        {categories_text}
        
        用户消息:
        "{user_message}"
        
        最佳匹配类别 (仅返回类别名称):
        """
        
        client = OpenAI()
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # 使用与记忆系统相同的模型
            messages=[
                {"role": "system", "content": "你是一个精确的文本分类助手，只返回最匹配的类别名称，不要解释。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,  # 低温度以获得一致的结果
            max_tokens=20     # 简短响应足够了
        )
        
        # 提取类别名称
        category = response.choices[0].message.content.strip().lower()
        
        # 确保返回的类别在我们的列表中
        if category in available_categories:
            logger.info(f"AI classified message as: {category}")
            return category
        else:
            logger.info(f"AI returned unknown category: {category}, defaulting to general_conversation")
            return "general_conversation"
            
    except Exception as e:
        logger.error(f"Error during category classification: {str(e)}")
        
        # 如果AI分类失败，直接使用默认类别
        logger.info(f"Falling back to default category due to classification error")
        return "general_conversation"

def reset_all_memories():
    """重置所有记忆（删除Qdrant集合并重新创建）"""
    if not QDRANT_AVAILABLE:
        logger.error("Qdrant client not available, cannot reset memories")
        return {"success": False, "error": "Qdrant client not available"}
    
    try:
        # 初始化Qdrant客户端
        qdrant_client = QdrantClient(
            host=MEM0_CONFIG["vector_store"]["config"]["host"],
            port=MEM0_CONFIG["vector_store"]["config"]["port"]
        )
        collection_name = MEM0_CONFIG["vector_store"]["config"]["collection_name"]
        
        # 检查集合是否存在
        collections = qdrant_client.get_collections().collections
        collection_names = [collection.name for collection in collections]
        
        # 如果集合存在，删除它
        if collection_name in collection_names:
            logger.info(f"删除Qdrant集合: {collection_name}")
            qdrant_client.delete_collection(collection_name=collection_name)
        
        # 创建新集合
        logger.info(f"创建新的Qdrant集合: {collection_name}，向量维度: 1536")
        qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=1536,
                distance=models.Distance.COSINE
            )
        )
        
        # 重新初始化记忆系统
        global get_memory
        get_memory = initialize_memory()
        
        return {"success": True}
    except Exception as e:
        error_message = f"重置记忆时出错: {str(e)}"
        logger.error(error_message)
        logger.error(traceback.format_exc())
        return {"success": False, "error": error_message}

def update_memory_mode(enabled):
    """更新记忆模式状态"""
    global MEMORY_MODE_ENABLED
    MEMORY_MODE_ENABLED = enabled
    logger.info(f"记忆模式状态更新为: {enabled}")
    return {"success": True}
