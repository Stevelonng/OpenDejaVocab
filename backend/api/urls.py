from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import web_views
from . import views_dictionary
from . import web_dictionary_views
from . import word_lookup
from . import web_sentence_views
from . import word_statistics_views
from . import home_views
from . import feedback_views
from . import privacy_views
from . import word_reference_views
from . import gemini_views
from . import chat_views
from . import gemini_default_view
from . import auto_subtitle_views  # Import new auto subtitle view
from .chat_views import (
    get_or_create_chat_session, end_chat_session, get_chat_sessions, 
    export_chat_notes, get_session_videos, delete_chat_session,
    ChatSessionListView, ChatSessionDetailView, delete_chat_session_web, download_chat_session
)

router = DefaultRouter()
router.register(r'videos', views.VideoViewSet, basename='video')
router.register(r'subtitles', views.SubtitleViewSet, basename='subtitle')
router.register(r'sentences', views.SentenceViewSet, basename='sentence')
router.register(r'word-references', word_reference_views.WordReferenceViewSet, basename='word-reference')

urlpatterns = [
    # Website homepage (accessible to anyone)
    path('', home_views.home_view, name='home'),
    
    # Privacy policy page (accessible to anyone)
    path('privacy-policy/', privacy_views.privacy_policy, name='privacy_policy'),
    
    # API root for checking if API is working (public)
    path('api/', views.api_root, name='api-root'),
    
    # Router URLs for model viewsets
    path('', include(router.urls)),
    
    # Authentication endpoints
    path('token/', views.CustomAuthToken.as_view(), name='api-token'),
    path('register-api/', views.register_user, name='register-api'),
    
    # Other API endpoints
    path('save-subtitles/', views.save_subtitles, name='save-subtitles'),
    path('add-sentence/', views.add_sentence, name='add-sentence'),
    
    # Video related operations
    path('videos/<str:video_id>/fetch-subtitles/', views.fetch_subtitles, name='fetch-subtitles'),
    path('videos/<str:video_id>/mark-subtitle/', views.mark_subtitle, name='mark-subtitle'),
    
    # Auto subtitle collection endpoint (not saved to database)
    path('auto-subtitles/', auto_subtitle_views.auto_fetch_subtitles, name='auto-subtitles'),
    
    # Word reference API endpoints
    path('create-word-reference/', word_reference_views.create_word_reference, name='create_word_reference'),
    path('get-word-references/', word_reference_views.get_word_references, name='get_word_references'),
    path('get-word-references/<str:word_text>/', word_reference_views.get_word_references, name='get_word_references_by_word'),
    path('delete-word-reference/<int:reference_id>/', word_reference_views.delete_word_reference, name='delete_word_reference'),
    
    # Web interface URLs
    path('web/', web_views.DashboardView.as_view(), name='dashboard'),
    path('web/login/', web_views.login_view, name='login'),
    path('web/logout/', web_views.logout_view, name='logout'),
    path('web/register/', web_views.register_view, name='register'),
    path('web/videos/<int:pk>/', web_views.VideoDetailView.as_view(), name='video_detail'),
    path('web/videos/<int:pk>/download/', web_views.download_subtitles, name='download_subtitles'),
    path('web/videos/<int:pk>/delete/', web_views.delete_video, name='delete_video'),
    path('web/videos/<int:pk>/subtitles/', web_dictionary_views.get_video_subtitles, name='video_subtitles'),
    
    # Dictionary web interface
    path('web/dictionary/', web_dictionary_views.DictionaryView.as_view(), name='dictionary'),
    path('web/favorites/', web_dictionary_views.FavoriteDictionaryView.as_view(), name='favorite_dictionary'),
    path('web/word-statistics/', word_statistics_views.WordStatisticsView.as_view(), name='word_statistics'),
    path('web/word-list-api/', word_statistics_views.WordListAPIView.as_view(), name='word_list_api'),
    path('web/words/delete-all/', web_dictionary_views.delete_all_words, name='delete_all_words'),
    path('web/words/<str:word_id>/delete/', web_dictionary_views.delete_word_view, name='delete_word'),
    path('web/words/<str:word_id>/update/', web_dictionary_views.update_word_view, name='update_word'),
    path('web/words/<str:pk>/', web_dictionary_views.WordDetailView.as_view(), name='word_detail'),
    # Sentence web interface
    path('web/sentences/', web_sentence_views.SentenceListView.as_view(), name='sentence_list'),
    path('web/sentences/<int:sentence_id>/delete/', web_sentence_views.delete_sentence, name='delete_sentence'),
    
    # Chat sessions web interface
    path('web/notes/', ChatSessionListView.as_view(), name='notes'),
    path('web/notes/<int:pk>/', ChatSessionDetailView.as_view(), name='notes_detail'),
    path('web/notes/<int:session_id>/delete/', delete_chat_session_web, name='delete_chat_session_web'),
    
    # Feedback
    path('feedback/', feedback_views.feedback_api, name='feedback_api'),
    path('web/submit-feedback/', feedback_views.submit_feedback, name='submit_feedback'),
    path('api/submit-feedback/', feedback_views.submit_feedback, name='submit_feedback'),
    path('web/videos/<int:video_id>/extract-words/', web_dictionary_views.extract_words_view, name='extract_words_from_video'),
    path('web/word-pronunciation/<str:text>/', web_dictionary_views.WordPronunciationView.as_view(), name='word_pronunciation'),
    # Add API version of pronunciation endpoint, consistent with other API paths
    path('api/web/word-pronunciation/<str:text>/', web_dictionary_views.WordPronunciationView.as_view(), name='api_word_pronunciation'),
    path('web/toggle-favorite/', web_dictionary_views.toggle_favorite_word, name='toggle_favorite_word'),
    path('web/check-favorite/', web_dictionary_views.check_favorite_word, name='web_check_favorite_word'),
    # Solve frontend request path issues, fully match frontend request paths
    path('api/web/toggle-favorite/', web_dictionary_views.toggle_favorite_word, name='toggle_favorite_word_api_path'),
    path('api/web/check-favorite/', web_dictionary_views.check_favorite_word, name='api_web_check_favorite_word'),
    
    # Token verification endpoints, for debugging
    path('verify-token/', web_dictionary_views.verify_token, name='verify_token'),
    path('api/verify-token/', web_dictionary_views.verify_token, name='api_verify_token'),
    path('web/verify-token/', web_dictionary_views.verify_token, name='web_verify_token'),
    
    # Get favorite words list
    path('favorite-words/', web_dictionary_views.get_favorite_words, name='get_favorite_words'),
    path('api/favorite-words/', web_dictionary_views.get_favorite_words, name='api_get_favorite_words'),
    path('web/favorite-words/', web_dictionary_views.get_favorite_words, name='web_get_favorite_words'),
    # Check if word is already favorited
    path('api/check-favorite/', web_dictionary_views.check_favorite_word, name='check_favorite_word'),
    # Word lookup API endpoint
    path('lookup-word/', word_lookup.lookup_word, name='lookup_word'),
    path('api/get_video_subtitles/<int:video_id>/', web_dictionary_views.get_video_subtitles, name='get_video_subtitles'),
    
    # Dictionary API endpoints
    path('videos/<int:video_id>/extract-words/', views_dictionary.extract_words_from_video, name='extract_words_from_video'),
    path('extract-all-words/', views_dictionary.extract_words_from_all_videos, name='extract_all_words'),
    path('words/<int:word_id>/', views_dictionary.update_word, name='update_word'),
    path('words/<int:word_id>/delete/', views_dictionary.delete_word, name='api_delete_word'),
    
    # Word reference API endpoints
    path('word-references/', word_reference_views.get_word_references, name='get_word_references'),
    path('word-references/<str:word_text>/', word_reference_views.get_word_references, name='get_word_reference_by_text'),
    path('word-references/<int:reference_id>/delete/', word_reference_views.delete_word_reference, name='delete_word_reference'),
    path('create-word-reference/', word_reference_views.create_word_reference, name='create_word_reference'),
    path('process-existing-words/', word_reference_views.process_existing_words, name='process_existing_words'),
    
    # Gemini AI API endpoints
    path('ai/chat-completion/', gemini_views.chat_completion, name='chat_completion'),
    path('api/chat-completion/', gemini_views.chat_completion, name='chat_completion'),
    # Default mode (no video history accumulation)
    path('ai/chat-completion-default/', gemini_default_view.chat_completion_default, name='chat_completion_default'),
    path('api/chat-completion-default/', gemini_default_view.chat_completion_default, name='chat_completion_default'),
    # Debug endpoints
    path('ai/debug-session/', gemini_views.debug_session, name='debug_session'),
    
    # Session status check
    path('chat/session-status/', gemini_views.session_status, name='session_status'),
    path('api/chat/session-status/', gemini_views.session_status, name='api_session_status'),
    
    # Chat session related
    path('chat/sessions/', get_chat_sessions, name='get_chat_sessions'),
    path('chat/create-session/', get_or_create_chat_session, name='create_chat_session'),
    path('chat/session-videos/', get_session_videos, name='get_session_videos'),
    path('chat/export-notes/', export_chat_notes, name='export_chat_notes'),
    path('chat/export-notes/<int:session_id>/', export_chat_notes, name='export_chat_notes_with_id'),
    
    # Chat session management API
    path('chat/session/', chat_views.get_or_create_chat_session, name='get_or_create_chat_session'),
    path('chat/session/end/', chat_views.end_chat_session, name='end_chat_session'),
    path('chat/session/delete/', chat_views.delete_chat_session, name='delete_chat_session'),
    path('chat/sessions/', chat_views.get_chat_sessions, name='get_chat_sessions'),
    path('chat-sessions/', chat_views.get_or_create_chat_session, name='get_or_create_chat_session'),
    path('chat-sessions/end/', chat_views.end_chat_session, name='end_chat_session'),
    path('chat-sessions/list/', chat_views.get_chat_sessions, name='get_chat_sessions'),
    path('chat-sessions/<int:session_id>/', chat_views.get_chat_session, name='get_chat_session'),
    path('chat-sessions/<int:session_id>/export/', chat_views.export_chat_notes, name='export_chat_notes'),
    
    # Compatible with frontend code
    path('chat/end-session/', chat_views.end_chat_session, name='end_chat_session_alt'),
    path('chat/export-notes/<int:session_id>/', chat_views.export_chat_notes, name='export_chat_notes_alt'),
    path('chat/sessions/', chat_views.get_chat_sessions, name='get_chat_sessions_alt'),
    path('chat/session/<int:session_id>/', chat_views.get_chat_session, name='get_chat_session_alt'),
]
