# Déjà Vocab
<p align="center"><i>Created entirely with Vibe Coding - not a single line handwritten because I'm still learning! 😭</i></p>

<p align="center">
  <img src="backend/static/images/logo.JPG" alt="Déjà Vocab Logo" width="200">
</p>

<div align="center">
  <h3>Intelligent YouTube Learning Assistant</h3>
  <p>Automatically captures video subtitles, builds your personal vocabulary, answers questions with AI in real-time, delivers personalized learning recommendations, and effortlessly enhances your language skills while you enjoy videos.</p>
  
  <p>
    <a href="#project-overview">Overview</a> •
    <a href="#core-features">Features</a> •
    <a href="#installation-and-setup">Installation</a> •
    <a href="#usage-guide">Usage</a> •
    <a href="#contributing">Contributing</a>
  </p>
  
  <p>
    <b><a href="#">English</a></b> | 
    <a href="README.zh.md">中文</a>
  </p>
</div>

---

## Project Overview

Déjà Vocab is a revolutionary Chrome extension that transforms ordinary YouTube video watching into a powerful language learning experience. By intelligently extracting and processing video subtitles, combined with advanced AI interaction and vocabulary management features, it creates an immersive learning environment that makes language learning natural and efficient.

Whether you're watching entertainment videos, educational content, or documentaries, Déjà Vocab helps you build your vocabulary, improve listening comprehension, and master authentic expressions while enjoying the content. This integration of entertainment and learning makes language acquisition less tedious and more a part of everyday life.

## Core Features

### 1. Interactive Vocabulary Learning System

- **Hover Word Lookup**: Hover your mouse over any word in the subtitles to instantly see its definition, including parts of speech, phonetic symbols, and example sentences. Quickly understand new words without interrupting your video viewing experience.
- **Click-to-Pronounce**: Click on a word to hear its standard pronunciation, helping you learn correct pronunciation and improving speaking skills. The system provides clear, authentic pronunciation references.
- **Double-click to Save**: Double-click any word to immediately add it to your personal vocabulary bank. The system automatically records the word's context for later review. Saved words are displayed in a special style for easy identification.

### 2. Video-Related Favorite Words Display

- **Automatic Detection**: When entering a YouTube video page, the system automatically identifies previously saved words that appear in the video, helping you discover how words you've learned are used in new contexts.
- **Context Display**: Shows the complete sentence in which each saved word appears, not just the word itself, helping you understand how words are used in real contexts.
- **One-click Navigation**: Click on an entry in your saved word list to automatically jump to the point in the video where the word appears, allowing you to immediately see the usage scenario and deepen understanding and memory.

### 3. Intelligent Subtitle Processing

- **Automatic Subtitle Retrieval**: Automatically extracts and processes subtitle content when opening a YouTube video, without the need to manually search for or download subtitle files. Supports recognition and processing of subtitles in multiple languages.
- **Subtitle Merging Optimization**: Uses NLP technology to merge fragmented subtitles into more meaningful complete sentences, providing a better reading and comprehension experience.
- **Auto-Pause Function**: Option to automatically pause the video at the end of each subtitle segment, allowing sufficient time to process and understand the current content. Especially suitable for beginners.

### 4. AI-Driven Learning Assistant

- **Dual-Mode Chat**:
  * **Default Mode**: Automatically resets the chat context with each video change, focusing on the current video content.
  * **Continuous Mode**: Maintains conversation context across video changes, allowing for more continuous learning experiences.
- **Contextual AI Responses**: The AI assistant analyzes both the video content and your learning history to provide highly relevant answers and suggestions.
- **Vocabulary Assistance**: Ask questions about any word, phrase, or expression in the video and receive detailed explanations, usage examples, and memory tips.
- **Learning Strategy Recommendations**: Receives personalized learning suggestions based on your interaction pattern, vocabulary level, and learning goals.

## Technical Architecture

### Backend (Django REST API)

- **User Authentication System**: Secure user account management and authentication
- **Vocabulary Management**: Storage and retrieval of user's saved words and learning progress
- **AI Integration**: Connection to Google's Gemini AI for intelligent language processing and responses
- **YouTube API Integration**: Fetching and processing video metadata and subtitles
- **User Learning Data Storage**: Tracking and saving user learning progress, preferences, and history

### Frontend (Chrome Extension)

- **YouTube Page Integration**: Seamlessly integrates into the YouTube interface, enhancing without disrupting the original experience
- **Interactive UI Components**: Highly responsive interface for word lookup, saving, and interactions
- **Local Storage Management**: Efficient client-side caching for offline functionality and performance
- **Environment Selector**: Switch between local development and production environments for easier testing and contribution

## Installation and Setup

### Prerequisites
- Python 3.9 or higher
- Node.js and npm (for extension development)
- Chrome browser
- Google Gemini API key (for AI features)

### Backend Setup
1. Clone the repository
   ```
   git clone https://github.com/Stevelonng/OpenDejaVocab.git
   cd OpenDejaVocab
   ```

2. Install Python dependencies
   ```
   pip install -r requirements.txt
   ```

3. Run database migrations
   ```
   cd backend
   python manage.py migrate
   ```

4. Configure Google Gemini API key
   - Open `backend/api/gemini_views.py` file
   - Find the line `GEMINI_API_KEY = "YOUR_API_KEY"`
   - Replace `YOUR_API_KEY` with your actual Google Gemini API key (obtainable from [Google AI Studio](https://makersuite.google.com/app/apikey))
   - Make the same replacement in the `backend/api/gemini_default_view.py` file

5. Start the Django server
   ```
   python manage.py runserver
   ```

### Chrome Extension Setup
1. Navigate to the extension directory
   ```
   cd extension
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Build the extension
   ```
   npm run build
   ```

4. Load the extension in Chrome
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked" and select the `dist` folder from the extension directory

5. Configure the extension
   - Click on the Déjà Vocab icon in your browser toolbar
   - Go to Settings and ensure the API URL is set to your local backend (`http://localhost:8000/` by default)
   - Log in or create an account

## Usage Guide

### Basic Usage
1. **Start Learning**: Navigate to any YouTube video with subtitles
2. **Interact with Words**: Hover over words to see definitions, click to hear pronunciation, double-click to save
3. **Use the AI Assistant**: Click the chat icon to ask questions about the video content or language usage
4. **Review Vocabulary**: Access your saved words through the vocabulary panel

### Advanced Features
1. **Customize Learning Experience**: Adjust settings for auto-pause, notification preferences, and UI display
2. **Study Mode**: Enable fullscreen immersive mode for focused learning
3. **Progress Tracking**: Monitor your vocabulary growth and learning patterns
4. **Cross-Device Sync**: Access your saved words and learning history across different devices

## Contributing

We welcome contributions to the Déjà Vocab project! Whether you're fixing bugs, adding features, improving documentation, or spreading the word, your help is appreciated.

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Environment
The project includes an environment selector in the UI (located at the bottom of the side panel) that allows easy switching between:
- Local Development (localhost) - Default setting that connects to a locally running backend server
- Production Environment - Connects to the deployed online service

This feature is particularly useful for developers and testers contributing to the project.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

- Project Repository: [https://github.com/Stevelonng/OpenDejaVocab](https://github.com/Stevelonng/OpenDejaVocab)
- Issue Reporting: Please use the GitHub Issues feature to report any problems or suggestions
