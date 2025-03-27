from django.shortcuts import render
from datetime import date

def privacy_policy(request):
    """显示隐私政策页面"""
    context = {
        'update_date': date.today().strftime('%Y年%m月%d日')
    }
    return render(request, 'api/privacy_policy.html', context)
