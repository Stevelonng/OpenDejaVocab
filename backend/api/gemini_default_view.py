import logging
import traceback
import os

# 导入dotenv加载.env文件
from dotenv import load_dotenv

# 加载.env文件中的环境变量
load_dotenv()


# 导入内存服务模块
from .memory_service import (
    get_memory_instance,
    add_memory, 
    retrieve_memories, 
    memory_executor,
    get_memory_category,
)

# 新增一个函数用于获取当前记忆模式状态
from .memory_service import get_memory_mode_enabled

# 获取内存实例并记录状态
memory = get_memory_instance()
logger = logging.getLogger(__name__)
logger.info(f"内存系统状态: {'已初始化' if memory else '未初始化'}")

from django.http import StreamingHttpResponse, JsonResponse
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from google import genai

# Setup logging
logger = logging.getLogger(__name__)

# Get Gemini API key from environment variables
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    logger.warning("未找到GEMINI_API_KEY环境变量，请确保.env文件包含此密钥")

# Directly instantiate the client without using the configure method
client = genai.Client(api_key=GEMINI_API_KEY)

# Use Gemini Flash model
GEMINI_MODEL = "gemini-2.0-flash"  # Use the same model as in gemini_views.py

# Cache timeout setting (3 hours)
CACHE_TIMEOUT = 60 * 30  # 0.5 hours
SESSION_TIMEOUT = 60 * 30  # 0.5 hours

# System instructions
SYSTEM_INSTRUCTION = """
You are "Déjà Vocab", a professional language learning assistant.
Please remember the user's name but do not mention the user ID in your responses.
Maintain a friendly and professional attitude, focusing on language learning.

Answering rules:
1. When the user is watching a video, prioritize combining the current video content to answer questions
   - Answer directly and naturally, as if you are part of the video
   - Do not use phrases like "According to the subtitle data" or "According to the subtitle I see"
   - Use natural and fluent language to explain the word meaning
   - Do not display the video ID in your responses
   - Always include the precise timestamp (in MM:SS format, e.g., 01:47) when referencing content from the video
   - AVOID beginning every response with greetings like "你好！" or "Hello!" - respond directly and naturally
   - NEVER claim the user has previously learned a word unless you have explicit memory data confirming this
   - IMPORTANT: Avoid starting every response with greetings like "你好！" or "Hello!", instead respond directly and naturally.

2. Vocabulary explanation rules:
   A. Vocabulary in the current video:
      - If the vocabulary appears in the current video's subtitles, directly explain its meaning and usage
      - You can refer to the video context to provide a richer explanation
      - Do not say "I couldn't find an explanation for xxx in this video"
      - If the vocabulary is indeed in the current video, directly explain it
      - Always include the exact timestamp where the vocabulary appears (in MM:SS format)
      - Highlight the vocabulary word using `span` format (with class="vocab-term") in your explanation
      - IMPORTANT: The timestamp must also be highlighted with backticks, e.g., `00:05`
      - RECOMMENDED FORMAT for single vocabulary term:
        <div class="current-video-vocab">
          <div class="vocab-content">
            <p>单词 <span class="vocab-term">rollercoaster</span> 在视频的 <span class="timestamp">00:50</span> 处出现，原句为："launching a rollercoaster off its track, and so much more!"</p>
            <p class="vocab-meaning">这个词指的是"过山车"，一种在游乐园常见的轨道式游乐设施。</p>
          </div>
        </div>
      - Example:
        <div class="current-video-vocab">
          <div class="vocab-content">
            <p>单词 <span class="vocab-term">rollercoaster</span> 在视频的 <span class="timestamp">00:50</span> 处出现，原句为："launching a rollercoaster off its track, and so much more!"</p>
            <p class="vocab-meaning">这个词指的是"过山车"，一种在游乐园常见的轨道式游乐设施。</p>
          </div>
        </div>

   B. Vocabulary in memories (from past videos):
      - Only mention past videos when the vocabulary is not in the current video but found in memory data
      - Create a standalone YouTube link with clean formatting (don't embed it in text)
      - ALWAYS highlight the vocabulary word/phrase using `span` format (with class="vocab-term") in your explanation, even when explaining variations
      - Include the timestamp in a natural way (e.g., "在视频`07:38`处" or "你在视频开始后`3分钟`左右学过")
      - IMPORTANT: The timestamp must also be highlighted with backticks, e.g., `07:38`
      - Do NOT use the word "时间戳" directly in your response
      - Example:
        "这个词在之前的视频中出现过:
        [Beat Ronaldo, Win $1,000,000](https://www.youtube.com/watch?v=0BjlBnfHcHM&t=332s)
        你在视频`05:32`处学过 <span class="vocab-term">Made it to our seats</span>，意思是'终于到达了我们的座位'。"

   C. When vocabulary is not found:
      - If you cannot find the word in the current video subtitles or in the user's memories, simply state this directly
      - NEVER invent examples or contexts - only use actual data from subtitles or memories
      - Be honest when you don't have enough information, for example: "我没有在当前视频中找到这个词的用法，也没有在您以前观看的视频中遇到过它。这个词的一般含义是..."
      - If you provide a general definition without context, clearly state that it's a general explanation
      - NEVER claim the user has previously encountered a word unless you have explicit memory data showing this
      - If you're unsure whether the word appeared in a previous video, DO NOT mention any previous videos
      - DO NOT state that the user "learned" any word previously without specific memory evidence

   D. Word form variations and phrases:
      - When searching for a word in memories, consider word form variations (e.g., if user asks about "escape", also consider "escaping", "escaped", etc.)
      - For phrases, look for similar variations (e.g., if user asks about "open the floodgates", consider "opened the emotional floodgates" as related)
      - Verb tense variations (present, past, participle) should be considered the same word
      - Gender variations (him/her, he/she) should be considered matches (e.g., "do him dirty" is the same as "did her dirty")
      - Subject/object variations ("I do" vs "they do" vs "he does") are considered the same expression
      - Reasonable pattern variations like "have blood on one's hand" vs "he's got blood on his hand" should be considered matches
      - If you find a related form but not the exact query, acknowledge this in your response and explain the connection
      - IMPORTANT: If you previously explained a phrase (like "do him dirty") and the user later asks about a variation (like "did her dirty"), use your prior explanation
      - ALWAYS highlight the vocabulary word/phrase using `span` format (with class="vocab-term") in your explanation, even when explaining variations
      - Example:
        "In this video, <span class="vocab-term">did her dirty</span> is a variation of <span class="vocab-term">do him dirty</span> which you learned before. It means to beat someone badly or embarrass them."

3. Answer priority:
   - Prioritize processing the current video content, whether or not there is memory data
   - Only use memory data when the vocabulary is not in the current video but has a record in memory
   - **CRITICAL RULE**: When the user is watching a video and asks about a vocabulary term:
     1. FIRST check if the term appears in the current video subtitles
     2. If it does, ALWAYS explain it using the current video context and NEVER reference past videos, even if the term exists in memory
     3. Only refer to memories/past videos if the term does NOT appear in the current video subtitles
   - For vocabulary queries, the system should:
     a) Check current video subtitles first
     b) Only if not found in current video, then check memories 
     c) If found in both, ONLY use current video information
   - For non-vocabulary queries (general questions or conversation), prioritize current context but also include relevant memory data when useful

   - **NEW RULE FOR COMMON WORDS**: For very common words (like conjunctions, prepositions, or basic verbs) that appear in both current video AND past memories:
     1. FIRST explain usage in the current video with the current-video-vocab format
     2. THEN (optionally) briefly mention "你也在之前的视频中学过这个词..." followed by a brief mention of 1-2 previous encounters
     3. Example response format:
        ```
        <div class="current-video-vocab">
          <div class="vocab-content">
            <p>单词 <span class="vocab-term">but</span> 在当前视频的 <span class="timestamp">00:08</span> 处出现，原句为："but what we didn't know is that..."</p>
            <p class="vocab-meaning">but 在这里用作连词，表示"但是"，用于引出与前面内容形成对比或转折的信息。</p>
          </div>
        </div>

        你也在之前的视频中学过这个词：
        [Mining 1,000,000 Blocks Alone!](https://www.youtube.com/watch?v=XXXX&t=8s)
        在视频<span class="timestamp">00:08</span>处，<span class="vocab-term">but</span> 同样用作连词，表示与前面内容形成对比或转折。
        ```
     4. 只对常见基础词汇（如连词、介词、基本动词等）使用这种双重解释，对专业词汇或短语仍然保持只解释当前视频的做法

4. Memory data judgment:
   - Carefully check the "is current video" mark in the user's context
   - If marked as "yes", it indicates that the memory is related to the current video
   - If marked as "no", it indicates that the memory is related to a past video

6. Video ID handling rules:
   - Do not display video IDs (like 6SEUgp3Pm0E) in your responses
   - When mentioning the current video, only say "in the current video 'video title'..." without displaying the ID
   - When mentioning past videos, use Markdown link format with timestamp: [Video Title](https://www.youtube.com/watch?v=VIDEO_ID&t=SECONDS_TIMESTAMP)
   - For timestamps, always convert from MM:SS format to seconds (e.g., 05:32 becomes &t=332s)
   - Examples:
     - For timestamp 00:08, link should be ...&t=8s
     - For timestamp 01:20, link should be ...&t=80s
     - For timestamp 10:05, link should be ...&t=605s
   - Remember: even if you use video IDs for internal matching, do not show the raw IDs to the user in your responses

7. Language rules:
   - Always respond in Chinese

8. Professionalism:
   - Responses should demonstrate language learning professionalism
   - Focus on context and actual usage
   - If suitable, provide related expressions or synonyms

9. Complete English sentence analysis:
   - When the user sends a complete English sentence from the video WITHOUT explicitly requesting grammar analysis, respond with this simplified format:
     <div class="sentence-example">
       <span class="sentence-timestamp">这句出现在视频的 <span class="timestamp">时间戳</span> 处</span>
       <div class="section-header"><span class="emoji-icon">📖</span> 整句理解</div>
       <span class="sentence-translation">**中文翻译**</span>
       <p>上下文解释...</p>
       <div class="key-vocabulary">
         <div class="section-header"><span class="emoji-icon">🖊️</span> 关键词汇/短语</div>
         <p><span class="vocab-term">词汇1</span>: 解释...</p>
         <p><span class="vocab-term">词汇2</span>: 解释...</p>
       </div>
     </div>
     - Fill in the actual timestamp, translation, explanation and key vocabulary
     - Keep the number of key vocabulary terms to 2-3 important ones
     - Always wrap vocabulary terms in span tags with the class="vocab-term"
     - CRITICAL: DO NOT repeat the timestamp in plain text outside of the HTML structure. Only include it once within the HTML.
   
   - When the user EXPLICITLY requests grammar analysis (使用类似"分析语法"、"语法结构"等词语请求), then provide the complete analysis with ALL these sections:
     <div class="sentence-example">
       <span class="sentence-timestamp">这句出现在视频的 <span class="timestamp">时间戳</span> 处</span>
       
       <div class="section-header">A. 整句理解</div>
       <span class="sentence-translation">**中文翻译**</span>
       <p>上下文和解释...</p>
       
       <div class="section-header">B. 语法结构</div>
       <p>语法分析内容...</p>
       
       <div class="section-header">C. 关键词汇/短语</div>
       <p><span class="vocab-term">词汇</span>: 解释...</p>
       
       <div class="section-header">D. 表达技巧</div>
       <p>表达技巧分析...</p>
       
       <div class="section-header">E. 上下文分析</div>
       <p>上下文分析内容...</p>
       
       <div class="section-header">F. 使用建议</div>
       <p>使用建议内容...</p>
     </div>
     - Fill in the actual content for each section
     - For key vocabulary terms, always use span tags with the class="vocab-term"
     - CRITICAL: DO NOT repeat the timestamp in plain text outside of the HTML structure. Only include it once within the HTML.
   
   - Tailor the depth of analysis based on sentence complexity (simple sentences need less analysis)
   - Always include timestamps in span tags with the class="timestamp" (e.g., <span class="timestamp">00:05</span>)
   
   - IMPORTANT: When analyzing spoken language:
     - Pay close attention to natural sentence boundaries, which are often unclear in casual speech
     - Be extremely careful not to artificially split phrases that belong together
     - Consider multiple interpretations of sentence boundaries when speech patterns are unclear
     - Use surrounding context (both before and after the sentence) to determine the most likely sentence structure
     - Verify that phrases you identify actually belong together by checking surrounding subtitles
     - Avoid incorrectly merging words that belong to different sentences (e.g., "damn you" vs. "damn. You...")
     - For ambiguous cases, explain the possible alternative interpretations to the user
     
   - CRITICAL ERROR CORRECTION FOR GAMING COMMENTARY:
     - When analyzing gaming videos (especially FIFA/FC):
       - "oh my God damn" is a common exclamation, where "damn" is NOT connected to any following "you"
       - Words following interjections like "damn" often start new sentences
       - Example: "...old games oh my God damn you" - here "you" likely starts next sentence
       - NEVER assume "damn you" is a phrase in gaming commentary without clear evidence
       - ALWAYS check if "you" connects grammatically to words AFTER it, not before it
       - When analyzing sentences containing "damn", verify context from surrounding subtitles
"""

# 添加会话级别字幕缓存
subtitle_cache = {}  # video_id -> subtitles list

def enhance_user_message(message, username, subtitles_data=None, video_title=None, memories=None, webpage_content=None):
    """Enhance user message, providing more context"""
    enhanced_message = message
    
    # 提取当前视频ID（如果有）
    current_youtube_video_id = None
    if 'session' in globals() and 'current_video_info' in session:
        current_youtube_video_id = session['current_video_info'].get('youtube_video_id', '')
    
    # Add user information
    if username:
        enhanced_message = f"Username: {username}\n\n" + enhanced_message
    
    # Add video information
    if video_title:
        # 如果当前有视频，添加视频ID信息用于AI比较
        if current_youtube_video_id:
            enhanced_message = f"Current video title: {video_title}\nCurrent video ID: {current_youtube_video_id}\n\n" + enhanced_message
        else:
            enhanced_message = f"Current video title: {video_title}\n\n" + enhanced_message
    
    # Add memory information if available
    if memories and memories.get('results') and len(memories['results']) > 0:
        # 将记忆按类别分组
        category_memories = {}
        for mem in memories['results']:
            category = mem.get('metadata', {}).get('category', 'general_conversation')
            if category not in category_memories:
                category_memories[category] = []
            
            # 构建包含更多元数据的记忆信息
            memory_entry = {
                'content': mem['memory'],
                'video_id': mem.get('metadata', {}).get('youtube_video_id', ''),
                'video_title': mem.get('metadata', {}).get('youtube_video_title', '')
            }
            category_memories[category].append(memory_entry)
        
        # 按类别格式化记忆
        formatted_memories = []
        for category, items in category_memories.items():
            formatted_memories.append(f"[{category.replace('_', ' ').title()}]")
            for item in items:
                memory_text = item['content']
                # 如果有视频标题和ID，添加到记忆中
                if item['video_id'] or item['video_title']:
                    video_context = []
                    if item['video_title']:
                        video_context.append(f"视频：{item['video_title']}")
                    if item['video_id']:
                        video_context.append(f"ID：{item['video_id']}")
                    
                    # 明确标记这个记忆是否来自当前视频
                    is_current_video = (item['video_id'] == current_youtube_video_id and current_youtube_video_id)
                    video_context.append(f"是当前视频：{'是' if is_current_video else '否'}")
                    
                    if video_context:
                        memory_text = f"{memory_text} [{' | '.join(video_context)}]"
                
                formatted_memories.append(f"- {memory_text}")
        
        # 添加到增强消息中
        memories_text = "\n".join(formatted_memories)
        enhanced_message = f"User Context:\n{memories_text}\n\n" + enhanced_message
    
    # 添加网页内容（如果存在）
    if webpage_content:
        webpage_title = webpage_content.get('title', '')
        webpage_url = webpage_content.get('url', '')
        webpage_content_text = webpage_content.get('content', '')
        
        if webpage_title and webpage_url and webpage_content_text:
            # 添加网页上下文，使用一个清晰的标签
            webpage_context = f"""
## Referenced Webpage Context
Title: {webpage_title}
URL: {webpage_url}
Content: {webpage_content_text}
"""
            enhanced_message = f"{webpage_context}\n\n" + enhanced_message
            logger.info(f"Added webpage context from: {webpage_url}")
    
    return enhanced_message

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_completion_default(request):
    """
    Handle chat requests and return AI responses
    Default mode: Reset session every time the video changes
    Do not save any chat records to the database
    """
    try:
        user_message = request.data.get('message', '')
        chat_history = request.data.get('history', [])
        subtitles_data = request.data.get('subtitles', [])
        youtube_video_id = request.data.get('videoId', '')
        youtube_video_title = request.data.get('videoTitle', '')
        user_id = request.data.get('userId') or request.user.id
        username = request.data.get('username') or request.user.username
        update_context_only = request.data.get('updateContextOnly', False)
        
        # 获取网页内容（如果有）
        webpage_content = request.data.get('webpageContent', None)
        
        # Log - avoid Chinese characters
        if update_context_only:
            logger.info(f"Context update request from user {user_id}, video ID: {youtube_video_id}")
        else:
            logger.info(f"Default mode chat request from user {user_id}, video ID: {youtube_video_id}")
        
        # If this is only a context update request, do not process the message, return success directly
        if update_context_only:
            logger.info(f"Successfully updated context for user {user_id}, video {youtube_video_id}, {len(subtitles_data) if subtitles_data else 0} subtitles")
            return JsonResponse({
                'success': True,
                'message': 'Context updated successfully'
            })
            
        # If the message is empty and it's not a context update, return an error
        if not user_message and not update_context_only:
            return JsonResponse({
                'error': 'Message is required'
            }, status=400)
        
        # 获取当前会话或创建新会话
        current_session_id = f"default_mode_{request.user.id}"
        if youtube_video_id:
            current_session_id = f"default_mode_{request.user.id}_{youtube_video_id}"
            
        session = cache.get(current_session_id, {})
        if not session:
            # 初始化新会话
            session = {
                "current_video_id": youtube_video_id,
                "current_video_info": {
                    "id": youtube_video_id,
                    "title": youtube_video_title
                },
                "subtitles_added": False,  # 初始状态：未添加字幕
                "conversation_history": []  # 新增：存储对话历史
            }
        elif session.get("current_video_id") != youtube_video_id:
            # 视频ID变化，重置会话
            session = {
                "current_video_id": youtube_video_id,
                "current_video_info": {
                    "id": youtube_video_id,
                    "title": youtube_video_title
                },
                "subtitles_added": False,  # 重置字幕状态
                "conversation_history": []  # 重置对话历史
            }
        
        # 更新或保持视频标题
        if youtube_video_title and session.get("current_video_info", {}).get("title") != youtube_video_title:
            session["current_video_info"]["title"] = youtube_video_title
            
        def generate_stream():
            nonlocal current_session_id, session
            import json  # Add local import to solve scope issue
            import time  # 将time导入移到函数顶部
            full_response = ""
            
            # Send an empty character as the initial response to let the frontend know the connection is established
            yield f"data: {json.dumps({'content': '', 'done': False, 'connected': True})}\n\n"
            
            try:
                # Get conversation history from session
                conversation = session.get("conversation_history", [])
                
                # If this is a new conversation, add system instruction
                if not conversation or len(conversation) <= 2:  # Only system instruction and model response
                    # Add system instruction - use user role because Gemini does not support system role
                    conversation = [
                        {"role": "user", "parts": [{"text": SYSTEM_INSTRUCTION}]},
                        {"role": "model", "parts": [{"text": "I understand my role as Déjà Vocab. I will help with your language learning needs."}]}
                    ]
                
                # Add the current user message
                user_memories = None
                if memory:
                    try:
                        # 检查记忆模式是否开启
                        if not get_memory_mode_enabled():
                            logger.info("记忆模式已关闭，跳过记忆检索")
                        else:
                            # 准备过滤条件
                            filter_params = {}
                            
                            # 如果在观看视频，可以尝试获取该视频相关的记忆
                            if youtube_video_id:
                                # 先尝试搜索与当前视频相关的记忆
                                video_memories = retrieve_memories(
                                    query=user_message, 
                                    user_id=str(request.user.id),
                                    limit=3,
                                    youtube_video_id=youtube_video_id  # 使用正确的参数名称
                                )
                                
                                if video_memories and video_memories.get('results') and len(video_memories['results']) > 0:
                                    logger.info(f"Retrieved {len(video_memories['results'])} memories for current video {youtube_video_id}")
                                    user_memories = video_memories
                            
                            # 如果没有找到与当前视频相关的记忆，或者没有正在观看视频，则搜索一般记忆
                            if not user_memories or not user_memories.get('results') or len(user_memories['results']) == 0:
                                # 基于当前类别和所有记忆进行搜索
                                general_memories = retrieve_memories(
                                    query=user_message, 
                                    user_id=str(request.user.id),
                                    limit=5  # 限制为前5个最相关的记忆
                                )
                                
                                if general_memories and general_memories.get('results'):
                                    logger.info(f"Retrieved {len(general_memories['results'])} general memories for user {request.user.id}")
                                    user_memories = general_memories
                                else:
                                    logger.info(f"No memories found for user {request.user.id}")
                    except Exception as mem_error:
                        logger.error(f"Error retrieving memories: {str(mem_error)}")
                        logger.error(traceback.format_exc())
                
                # Detect if the user is asking about subtitle-related information
                subtitle_query_patterns = [
                    'subtitles', 'captions', 'said', 'content', 'transcript'
                ]
                is_asking_about_subtitles = any(pattern in user_message.lower() for pattern in subtitle_query_patterns)
                
                # Detect if the user is asking about video-related information
                video_query_patterns = [
                    'what video', 'which video', 'video name', 'video title', 'watching'
                ]
                is_asking_about_video = any(pattern in user_message.lower() for pattern in video_query_patterns)
                
                # Enhance the user message
                enhanced_user_message = enhance_user_message(
                    user_message, 
                    username, 
                    subtitles_data if is_asking_about_subtitles else None,
                    youtube_video_title if is_asking_about_video else None,
                    user_memories,  # Add memories to the enhanced message
                    webpage_content  # Add webpage content to the enhanced message
                )
                
                # Add the enhanced user message to the conversation
                conversation.append({"role": "user", "parts": [{"text": enhanced_user_message}]})
                
                # Prepare system instructions for the Gemini model if needed
                if not subtitles_data or len(subtitles_data) == 0 or not youtube_video_id:
                    # No need to add subtitles
                    pass
                else:
                    # Check if subtitles already added
                    subtitles_already_added = session.get('subtitles_added', False)
                    
                    # Only add subtitles if they haven't been added before
                    if not subtitles_already_added:
                        # Build subtitle text
                        subtitles_text = f"CURRENT VIDEO: \"{youtube_video_title}\" (ID: {youtube_video_id})\n\nVIDEO SUBTITLES:\n"
                        for i, subtitle in enumerate(subtitles_data[:200]):  # 限制添加的字幕数量
                            start_time = subtitle.get('startTime', 0)
                            text = subtitle.get('text', '')
                            if text and text.strip():
                                # Format time as MM:SS (保持两位数格式)
                                minutes = int(start_time // 60)
                                seconds = int(start_time % 60)
                                time_str = f"{minutes:02d}:{seconds:02d}"
                                subtitles_text += f"{time_str} - {text}\n"
                        
                        # Add subtitles to system instructions
                        system_message = SYSTEM_INSTRUCTION + "\n\n" + subtitles_text
                        
                        # Replace the first system instruction with the updated one containing subtitles
                        if conversation and len(conversation) >= 1 and conversation[0]["role"] == "user":
                            conversation[0]["parts"][0]["text"] = system_message
                        
                        # Mark subtitles as added
                        session['subtitles_added'] = True
                
                try:
                    # Call the API with the conversation history
                    response = client.models.generate_content(
                        model=GEMINI_MODEL,
                        contents=conversation
                    )
                    
                    # Get the complete text
                    if hasattr(response, 'text'):
                        complete_text = response.text
                    elif hasattr(response, 'parts'):
                        complete_text = ''.join([part.text for part in response.parts if hasattr(part, 'text')])
                    else:
                        complete_text = str(response)
                    
                    # Ensure complete text is not empty
                    if not complete_text:
                        complete_text = "I apologize, but I couldn't generate a response. Please try again."
                    
                    # Add the model response to the conversation history
                    conversation.append({"role": "model", "parts": [{"text": complete_text}]})
                    
                    # Update session with the new conversation history
                    session["conversation_history"] = conversation
                    
                    # Update cache
                    cache.set(current_session_id, session, timeout=SESSION_TIMEOUT)
                    
                    # Prepare for streaming response
                    full_response = ""
                    
                    # Use larger blocks and intervals for longer texts, improving efficiency
                    total_length = len(complete_text)
                    
                    # Adjust block size based on text length
                    if total_length < 100:
                        # For short texts, use smaller blocks for a more natural effect
                        chunks = [complete_text[i:i+3] for i in range(0, total_length, 3)]
                    elif total_length < 500:
                        # Medium-length texts
                        chunks = [complete_text[i:i+5] for i in range(0, total_length, 5)]
                    else:
                        # Long texts use larger blocks, improving efficiency
                        chunks = [complete_text[i:i+10] for i in range(0, total_length, 10)]
                    
                    for i, text_chunk in enumerate(chunks):
                        full_response += text_chunk
                        
                        # Send to the frontend
                        yield f"data: {json.dumps({'content': text_chunk, 'done': False})}\n\n"
                        
                        # Add a small delay to simulate human typing speed
                        time.sleep(0.01)  # 10ms delay, like real human typing
                    
                    # Send the completion signal
                    yield f"data: {json.dumps({'content': '', 'done': True, 'model': GEMINI_MODEL})}\n\n"
                    
                    # Store conversation to mem0 memory if available
                    if memory:
                        try:
                            # 检查记忆模式是否开启
                            if not get_memory_mode_enabled():
                                logger.info("记忆模式已关闭，跳过向gemini_default_view中提交记忆任务")
                            else:    
                                # 获取适合的记忆类别
                                memory_category = get_memory_category(user_message, youtube_video_title)
                                # logger.info(f"分类记忆为: {memory_category}")
                                
                                # 准备用于记忆的消息，如果视频标题存在，则包含它
                                memory_input_message = user_message
                                # 所有记忆操作都移到异步线程中处理
                                memory_executor.submit(
                                    add_memory,
                                    memory_input_message,
                                    request.user.id,
                                    youtube_video_id,
                                    youtube_video_title, # 仍然传递原始标题作为元数据
                                    complete_text,
                                    memory_category  # 传递确定的类别
                                )
                                # logger.info(f"已提交记忆添加任务，用户: {request.user.id}，类别: {memory_category}")
                        except Exception as mem_add_error:
                            # 只记录错误，不影响主流程
                            logger.error(f"Error submitting memory task: {str(mem_add_error)}")

                except Exception as api_error:
                    error_message = str(api_error)
                    logger.error(f"Gemini API error: {error_message}")
                    
                    # Clean sensitive error information
                    safe_error = "AI service is temporarily unavailable, please try again later."
                    yield f"data: {json.dumps({'content': safe_error, 'done': False})}\n\n"
                    full_response = safe_error
                
                # Update the conversation in the session, but limit it to the last 20 messages (keep the session relatively small in default mode)
                # Add the user message to the session
                if conversation and len(conversation) > 0:
                    session["conversation"] = conversation
                
                # Update the session in the cache
                cache.set(current_session_id, session, SESSION_TIMEOUT)
                
            except Exception as e:
                # Send error message to the client
                error_message = str(e)
                logger.error(f"Error in chat generation: {error_message}")
                logger.error(traceback.format_exc())
                yield f"data: {json.dumps({'content': 'An error occurred while processing your request.', 'done': False})}\n\n"
                yield f"data: {json.dumps({'content': '', 'done': True, 'error': True})}\n\n"
        
        # Return the streaming response
        return StreamingHttpResponse(
            generate_stream(),
            content_type='text/event-stream'
        )
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        
        return Response(
            {"error": "The server encountered an error while processing your request, please try again later."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
