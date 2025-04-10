from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import os
import requests
import logging
from google.cloud import translate_v3
import google.auth
import google.auth.exceptions
from google.oauth2 import service_account

# Configure logging
logger = logging.getLogger(__name__)

# Google Translate API settings
# API Key 方式认证（v2版本）
GOOGLE_TRANSLATE_API_KEY = os.environ.get("GOOGLE_TRANSLATE_API_KEY", "AIzaSyDZXgU5L5DYEXjtDl4c1k1FEwe0L0h-z2A")
GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"

# 服务账号方式认证 (v3 API)
# 可以通过环境变量或JSON文件加载认证信息
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
# 也可以直接指定项目ID，如果未设置，将尝试从凭据中获取
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT_ID", "")
LOCATION = "global"  # 默认使用 global 位置

# 设置使用哪种API版本 ('v2' 或 'v3')
USE_API_VERSION = os.environ.get("GOOGLE_TRANSLATE_API_VERSION", "v2")

def get_translation_client():
    """
    获取翻译客户端实例
    优先使用环境变量中的凭据文件路径
    如果未设置，尝试使用默认凭据
    """
    if USE_API_VERSION == 'v2':
        return GoogleTranslateV2Client(GOOGLE_TRANSLATE_API_KEY)
    elif USE_API_VERSION == 'v3':
        try:
            if GOOGLE_APPLICATION_CREDENTIALS:
                # 使用指定的服务账号凭据
                credentials = service_account.Credentials.from_service_account_file(
                    GOOGLE_APPLICATION_CREDENTIALS
                )
                client = translate_v3.TranslationServiceClient(credentials=credentials)
            else:
                # 尝试使用默认凭据
                client = translate_v3.TranslationServiceClient()
            
            return client
        except Exception as e:
            logger.error(f"Failed to create translation client: {str(e)}")
            return None
    else:
        logger.error("Invalid API version. Please set GOOGLE_TRANSLATE_API_VERSION to 'v2' or 'v3'.")
        return None

class GoogleTranslateV2Client:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = GOOGLE_TRANSLATE_URL

    def translate_text(self, request):
        params = {
            "key": self.api_key,
            "q": request["contents"][0],
            "target": request["target_language_code"],
            "source": request.get("source_language_code"),
            "format": "text"
        }

        response = requests.get(self.base_url, params=params)

        if response.status_code == 200:
            data = response.json()
            translations = data["data"]["translations"]
            translated_text = translations[0]["translatedText"]
            return {"translations": [{"translated_text": translated_text}]}
        else:
            logger.error(f"Error translating text: {response.text}")
            return None

def get_project_id():
    """获取项目ID，优先使用环境变量中设置的项目ID"""
    if PROJECT_ID:
        return PROJECT_ID
    
    try:
        # 尝试从默认凭据中获取项目ID
        _, project_id = google.auth.default()
        return project_id
    except google.auth.exceptions.DefaultCredentialsError:
        logger.error("No project ID could be determined.")
        return None

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_text(request):
    """
    使用 Google Cloud Translation API v3 翻译文本
    
    请求体应包含:
    - text: 要翻译的文本
    - target_language: 目标语言代码 (例如 'zh-CN', 'en', 'es')
    - source_language: 可选的源语言代码
    
    返回:
    - translated_text: 翻译后的文本
    - source_language: 检测到的或指定的源语言
    """
    try:
        # 获取请求参数
        text = request.data.get('text')
        target_language = request.data.get('target_language', 'en')
        source_language = request.data.get('source_language', None)
        
        # 验证必需参数
        if not text:
            return Response({
                'error': '需要提供要翻译的文本'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not target_language:
            return Response({
                'error': '需要提供目标语言'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取翻译客户端
        client = get_translation_client()
        if not client:
            return Response({
                'error': '无法创建翻译客户端',
                'details': '请确保已正确配置 Google Cloud 凭据'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 获取项目ID
        project_id = get_project_id()
        if not project_id:
            return Response({
                'error': '未找到项目ID',
                'details': '请设置 GOOGLE_CLOUD_PROJECT_ID 环境变量或确保凭据中包含项目ID'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 构建父资源名称
        parent = f"projects/{project_id}/locations/{LOCATION}"
        
        # 准备请求内容
        contents = [text]
        
        # 调用翻译API
        if isinstance(client, GoogleTranslateV2Client):
            response = client.translate_text({
                "parent": parent,
                "contents": contents,
                "mime_type": "text/plain",  # 指定MIME类型为纯文本
                "source_language_code": source_language,
                "target_language_code": target_language,
            })
        else:
            response = client.translate_text(
                request={
                    "parent": parent,
                    "contents": contents,
                    "mime_type": "text/plain",  # 指定MIME类型为纯文本
                    "source_language_code": source_language,
                    "target_language_code": target_language,
                }
            )
        
        # 处理响应
        if response and response.get("translations"):
            translations = response["translations"]
            if translations and len(translations) > 0:
                translated_text = translations[0].get("translated_text") or translations[0].get("translatedText")
                detected_source_language = translations[0].get("detected_language_code") or source_language
                
                return Response({
                    'translated_text': translated_text,
                    'source_language': detected_source_language,
                    'target_language': target_language
                })
            else:
                return Response({
                    'error': '翻译失败，未返回翻译结果'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            return Response({
                'error': '翻译失败，未返回翻译结果'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except Exception as e:
        logger.error(f"Error in translate_text: {str(e)}")
        return Response({
            'error': '翻译文本失败',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_supported_languages(request):
    """
    获取 Google Cloud Translation API 支持的语言列表
    
    查询参数:
    - target: 可选的目标语言，用于显示语言名称
    
    返回:
    - languages: 支持的语言列表，包含代码和名称
    """
    try:
        target = request.query_params.get('target', 'en')
        
        # 获取翻译客户端
        client = get_translation_client()
        if not client:
            return Response({
                'error': '无法创建翻译客户端',
                'details': '请确保已正确配置 Google Cloud 凭据'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 获取项目ID
        project_id = get_project_id()
        if not project_id:
            return Response({
                'error': '未找到项目ID',
                'details': '请设置 GOOGLE_CLOUD_PROJECT_ID 环境变量或确保凭据中包含项目ID'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 构建父资源名称
        parent = f"projects/{project_id}/locations/{LOCATION}"
        
        # 调用API获取支持的语言
        if isinstance(client, GoogleTranslateV2Client):
            params = {
                "key": client.api_key,
                "target": target
            }
            response = requests.get(f"{client.base_url}/languages", params=params)
            if response.status_code == 200:
                data = response.json()
                languages = data["data"]["languages"]
                formatted_languages = []
                for language in languages:
                    formatted_languages.append({
                        'language_code': language["language"],
                        'display_name': language["name"]
                    })
                return Response({'languages': formatted_languages})
            else:
                logger.error(f"Error getting supported languages: {response.text}")
                return Response({
                    'error': '获取支持的语言失败',
                    'details': response.text
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            response = client.get_supported_languages(
                request={
                    "parent": parent,
                    "display_language_code": target,
                }
            )
            
            # 格式化响应
            languages = []
            for language in response.languages:
                languages.append({
                    'language_code': language.language_code,
                    'display_name': language.display_name
                })
            
            return Response({'languages': languages})
        
    except Exception as e:
        logger.error(f"Error in get_supported_languages: {str(e)}")
        return Response({
            'error': '获取支持的语言失败',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def batch_translate(request):
    """
    在单个请求中批量翻译多个文本
    
    请求体应包含:
    - texts: 要翻译的文本列表
    - target_language: 目标语言代码
    - source_language: 可选的源语言代码
    
    返回:
    - translations: 翻译后的文本列表
    """
    try:
        texts = request.data.get('texts', [])
        target_language = request.data.get('target_language', 'en')
        source_language = request.data.get('source_language')
        
        if not texts or not isinstance(texts, list):
            return Response({
                'error': '需要提供要翻译的文本列表'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取翻译客户端
        client = get_translation_client()
        if not client:
            return Response({
                'error': '无法创建翻译客户端',
                'details': '请确保已正确配置 Google Cloud 凭据'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 获取项目ID
        project_id = get_project_id()
        if not project_id:
            return Response({
                'error': '未找到项目ID',
                'details': '请设置 GOOGLE_CLOUD_PROJECT_ID 环境变量或确保凭据中包含项目ID'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 构建父资源名称
        parent = f"projects/{project_id}/locations/{LOCATION}"
        
        # API 有请求大小限制，所以我们可能需要分批处理
        batch_size = 100  # 根据API限制调整
        translations = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            
            # 调用翻译API
            if isinstance(client, GoogleTranslateV2Client):
                params = {
                    "key": client.api_key,
                    "q": batch,
                    "target": target_language,
                    "source": source_language,
                    "format": "text"
                }
                response = requests.post(f"{client.base_url}", params=params)
                if response.status_code == 200:
                    data = response.json()
                    batch_translations = [t["translatedText"] for t in data["data"]["translations"]]
                    translations.extend(batch_translations)
                else:
                    logger.error(f"Error translating batch: {response.text}")
                    return Response({
                        'error': '批量翻译文本失败',
                        'details': response.text
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                response = client.translate_text(
                    request={
                        "parent": parent,
                        "contents": batch,
                        "mime_type": "text/plain",
                        "source_language_code": source_language,
                        "target_language_code": target_language,
                    }
                )
                
                # 处理响应
                batch_translations = [t.translated_text for t in response.translations]
                translations.extend(batch_translations)
        
        return Response({
            'translations': translations,
            'count': len(translations)
        })
        
    except Exception as e:
        logger.error(f"Error in batch_translate: {str(e)}")
        return Response({
            'error': '批量翻译文本失败',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def detect_language(request):
    """
    检测文本的语言
    
    请求体应包含:
    - text: 要检测语言的文本
    
    返回:
    - detected_language: 检测到的语言代码
    - confidence: 检测结果的置信度
    """
    try:
        text = request.data.get('text')
        
        if not text:
            return Response({
                'error': '需要提供要检测语言的文本'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取翻译客户端
        client = get_translation_client()
        if not client:
            return Response({
                'error': '无法创建翻译客户端',
                'details': '请确保已正确配置 Google Cloud 凭据'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 获取项目ID
        project_id = get_project_id()
        if not project_id:
            return Response({
                'error': '未找到项目ID',
                'details': '请设置 GOOGLE_CLOUD_PROJECT_ID 环境变量或确保凭据中包含项目ID'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 构建父资源名称
        parent = f"projects/{project_id}/locations/{LOCATION}"
        
        # 调用检测语言API
        if isinstance(client, GoogleTranslateV2Client):
            params = {
                "key": client.api_key,
                "q": text
            }
            response = requests.get(f"{client.base_url}/detect", params=params)
            if response.status_code == 200:
                data = response.json()
                detected_language = data["data"]["detections"][0]["language"]
                confidence = data["data"]["detections"][0]["confidence"]
                return Response({
                    'detected_language': detected_language,
                    'confidence': confidence
                })
            else:
                logger.error(f"Error detecting language: {response.text}")
                return Response({
                    'error': '检测语言失败',
                    'details': response.text
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            response = client.detect_language(
                request={
                    "parent": parent,
                    "content": text,
                    "mime_type": "text/plain",
                }
            )
            
            # 处理响应
            if response.languages and len(response.languages) > 0:
                detected_language = response.languages[0].language_code
                confidence = response.languages[0].confidence
                
                return Response({
                    'detected_language': detected_language,
                    'confidence': confidence
                })
            else:
                return Response({
                    'error': '语言检测失败，未返回结果'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except Exception as e:
        logger.error(f"Error in detect_language: {str(e)}")
        return Response({
            'error': '检测语言失败',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def auto_translate_sentence(request):
    """
    自动翻译一个句子并保存到数据库
    
    请求体应包含:
    - sentence_id: 要翻译的句子ID
    - target_language: 目标语言代码
    
    返回:
    - success: 是否成功
    - sentence: 更新后的句子信息
    """
    from .models import Sentence
    
    try:
        sentence_id = request.data.get('sentence_id')
        target_language = request.data.get('target_language', 'zh-CN')
        
        if not sentence_id:
            return Response({
                'error': '需要提供句子ID'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取句子对象
        try:
            sentence = Sentence.objects.get(id=sentence_id, user=request.user)
        except Sentence.DoesNotExist:
            return Response({
                'error': '未找到指定的句子'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # 如果已经有翻译，直接返回
        if sentence.translation:
            return Response({
                'success': True,
                'message': '句子已有翻译',
                'sentence': {
                    'id': sentence.id,
                    'text': sentence.text,
                    'translation': sentence.translation
                }
            })
        
        # 获取翻译客户端
        client = get_translation_client()
        if not client:
            return Response({
                'error': '无法创建翻译客户端',
                'details': '请确保已正确配置 Google Cloud 凭据'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 获取项目ID
        project_id = get_project_id()
        if not project_id:
            return Response({
                'error': '未找到项目ID',
                'details': '请设置 GOOGLE_CLOUD_PROJECT_ID 环境变量或确保凭据中包含项目ID'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 构建父资源名称
        parent = f"projects/{project_id}/locations/{LOCATION}"
        
        # 调用翻译API
        if isinstance(client, GoogleTranslateV2Client):
            params = {
                "key": client.api_key,
                "q": sentence.text,
                "target": target_language,
                "source": "",
                "format": "text"
            }
            response = requests.post(f"{client.base_url}", params=params)
            if response.status_code == 200:
                data = response.json()
                translated_text = data["data"]["translations"][0]["translatedText"]
                sentence.translation = translated_text
                sentence.save()
                return Response({
                    'success': True,
                    'message': '翻译成功',
                    'sentence': {
                        'id': sentence.id,
                        'text': sentence.text,
                        'translation': sentence.translation
                    }
                })
            else:
                logger.error(f"Error translating sentence: {response.text}")
                return Response({
                    'error': '翻译句子失败',
                    'details': response.text
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            response = client.translate_text(
                request={
                    "parent": parent,
                    "contents": [sentence.text],
                    "mime_type": "text/plain",
                    "target_language_code": target_language,
                }
            )
            
            # 处理响应
            if response.translations and len(response.translations) > 0:
                translated_text = response.translations[0].translated_text
                
                # 更新句子的翻译
                sentence.translation = translated_text
                sentence.save()
                
                return Response({
                    'success': True,
                    'message': '翻译成功',
                    'sentence': {
                        'id': sentence.id,
                        'text': sentence.text,
                        'translation': sentence.translation
                    }
                })
            else:
                return Response({
                    'error': '翻译失败，未返回翻译结果'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except Exception as e:
        logger.error(f"Error in auto_translate_sentence: {str(e)}")
        return Response({
            'error': '翻译句子失败',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
