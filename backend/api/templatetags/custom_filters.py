from django import template
import re
import math
from django.utils.safestring import mark_safe

register = template.Library()

@register.filter
def youtube_id(url):
    """Extract YouTube ID from a URL"""
    if not url:
        return ''
    
    youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/)|\
                      youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(youtube_regex, url)
    
    if not match:
        return ''
    
    return match.group(1)

@register.filter
def format_time(seconds):
    """Format time in seconds to MM:SS.MS format"""
    if seconds is None:
        return '00:00'
    
    # Round to 1 decimal place
    seconds = round(seconds, 1)
    
    minutes = math.floor(seconds / 60)
    remaining_seconds = seconds % 60
    
    return f"{minutes:02d}:{remaining_seconds:04.1f}"

@register.filter(is_safe=True)
def format_markdown(value):
    """Format text with line breaks to improve readability."""
    if not value:
        return ''
    
    # Replace newlines with HTML line breaks
    value = value.replace('\n', '<br>')
    
    # Make asterisk-wrapped text bold
    value = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', value)
    value = re.sub(r'\*(.*?)\*', r'<em>\1</em>', value)
    
    return mark_safe(value)
