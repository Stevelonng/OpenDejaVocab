from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """This method is called when Django app is ready to register signals"""
        import api.signals  # Import signals module
        import api.signals_user_activity  # Import user activity tracking signals module
