from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """当Django应用准备就绪时调用该方法注册信号"""
        import api.signals  # 导入信号模块
        import api.signals_user_activity  # 导入用户活动跟踪信号模块
