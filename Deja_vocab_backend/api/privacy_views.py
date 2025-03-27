from django.shortcuts import render
from datetime import date

def privacy_policy(request):
    """
    Display privacy policy page
    """
    context = {
        'update_date': date.today().strftime('%Y-%m-%d')
    }
    return render(request, 'api/privacy_policy.html', context)
