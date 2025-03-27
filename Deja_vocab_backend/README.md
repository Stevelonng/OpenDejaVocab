# Déjà Vocab 

A language learning tool that collects subtitles from YouTube videos, allowing users to build personalized dictionaries of phrases and expressions for more effective language learning.

## Project Overview

This project consists of two main components:

1. **Django Backend**: REST API that stores video data, subtitles, and user dictionaries
2. **Chrome Extension**: Browser extension for YouTube that extracts subtitles and interacts with the backend

### Features

- **Automatic Subtitle Collection**: Extract subtitles from YouTube videos
- **Personal Dictionary**: Save important phrases and expressions to your own dictionary
- **Subtitle Timestamps**: Each subtitle is saved with its timestamp for easy reference
- **Cross-Reference Support**: Connect phrases across different videos to see them in various contexts

## Backend Setup

### Prerequisites

- Python 3.8+
- Django 5.1+
- Django REST Framework

### Installation

1. Navigate to the project directory:
   ```
   cd youtube-subtitle-collector
   ```

2. Activate the virtual environment:
   ```
   source venv/bin/activate
   ```

3. Run database migrations:
   ```
   python manage.py makemigrations
   python manage.py migrate
   ```

4. Create a superuser for the admin interface:
   ```
   python manage.py createsuperuser
   ```

5. Start the development server:
   ```
   python manage.py runserver
   ```

6. Access the admin interface at http://localhost:8000/admin/

### API Endpoints

- `GET/POST /api/videos/`: List or create videos
- `GET/POST /api/subtitles/`: List or get subtitles (filter by video_id)
- `GET/POST /api/phrases/`: Access your saved phrases (personal dictionary)
- `POST /api/save-subtitles/`: Save multiple subtitles at once for a video
- `POST /api/add-phrase/`: Add a phrase to your dictionary with reference to a subtitle

## Chrome Extension Setup

### Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `chrome-extension` directory

### Usage

1. Navigate to a YouTube video
2. Click the extension icon to open the popup
3. Use "Collect All Subtitles" to fetch and save all subtitles
4. Use "Mark Current Subtitle" while watching to add the current phrase to your dictionary

## Development Notes

### Django Models

- **Video**: Stores information about YouTube videos
- **Subtitle**: Contains subtitle text and timestamps
- **Phrase**: Represents a saved phrase in the user's dictionary
- **PhraseReference**: Links phrases to their original subtitles

### Browser Extension

The extension uses:
- Content scripts to interact with YouTube pages
- Background script for extension lifecycle management
- Popup for user interface

## Future Enhancements

- **Multilingual Support**: Add translation capabilities
- **Smart Phrase Recognition**: Automatically identify important phrases
- **Progress Tracking**: Track which videos and phrases you've studied
- **Export/Import**: Share dictionaries or export for offline study
- **Support for Other Platforms**: Add support for other video platforms beyond YouTube

## License

This project is intended for educational purposes.
