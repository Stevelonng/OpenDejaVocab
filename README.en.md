# Déjà Vocab - Building the Ultimate Language Learning Ecosystem

[中文](README.md) | English

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

- **Automatic Subtitle Retrieval**: Automatically extracts and processes subtitle content when opening a YouTube video, without the need to manually search for or download subtitle files. Supports subtitle recognition and processing in multiple languages.
- **Subtitle Merging Optimization**: Uses NLP technology to merge fragmented subtitles into more meaningful complete sentences, providing a better reading and comprehension experience.
- **Auto-pause Function**: Option to automatically pause the video at the end of each subtitle segment, giving sufficient time to process and understand the current content, especially suitable for beginners.

### 4. AI-Driven Learning Assistant

- **Dual-mode Chat**:
  * **Default Mode**: Automatically resets the chat with each video change, focusing on learning and understanding the current content
  * **Cumulative Mode**: Maintains conversation continuity across videos, building learning context across content, suitable for systematic study of a topic
- **Content-aware Interaction**: The AI assistant understands video content and can answer questions about specific words, phrases, or grammatical structures in the video, providing relevant explanations and suggestions.
- **User ID Binding**: The system remembers user identity and preferences, providing a personalized experience and maintaining consistent learning progress even when used on different devices.

### 5. Immersive Learning Interface

- **Full-screen Learning View**: Optimized layout where video, subtitles, saved words, and AI assistant coexist, creating a focused learning environment with minimal external distractions.
- **Sidebar Mode**: Displays the learning panel on the right side of the regular YouTube interface, which can be expanded or collapsed at any time without affecting the normal video viewing experience.
- **Responsive Design**: Interface adapts to different screen sizes and resolutions, providing a consistent user experience across various devices.

## System Architecture

Déjà Vocab consists of two main components:

### Backend (Django REST API)

- **User Authentication & Management**: Secure user registration, login, and profile management system
- **Video Subtitle Processing**: Automatic retrieval, analysis, and optimization of YouTube video subtitles
- **Vocabulary Extraction & Management**: Identification, storage, and organization of user-saved words and sentences
- **AI Assistant Integration**: Integration with Google Gemini API, providing intelligent interaction and language learning support
- **User Learning Data Storage**: Tracking and saving user learning progress, preferences, and history

### Frontend (Chrome Extension)

- **YouTube Page Integration**: Seamlessly integrates into the YouTube interface, enhancing without disrupting the original experience
- **Interactive UI Components**: Intuitive, user-friendly interface including pop-up vocabulary cards, collection panels, and AI chat windows
- **Local Data Caching**: Reduces network requests, improves performance, and supports offline operations
- **Backend API Communication**: Securely and efficiently transmits and synchronizes user data

## Installation Guide

### Backend Deployment

1. Clone the repository
   ```bash
   git clone https://github.com/Stevelonng/OpenDejaVocab.git
   cd OpenDejaVocab/Deja_vocab_backend
   ```

2. Create a virtual environment
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   # or .venv\Scripts\activate  # Windows
   ```

3. Install dependencies
   ```bash
   pip install -r requirements.txt
   python -m spacy download en_core_web_sm
   ```

4. Configure Google Gemini API key
   - Open the `Deja_vocab_backend/api/gemini_views.py` file
   - Find the line `GEMINI_API_KEY = "YOUR_API_KEY"`
   - Replace `YOUR_API_KEY` with your actual Google Gemini API key (obtainable from [Google AI Studio](https://makersuite.google.com/app/apikey))
   - Also make the same replacement in the `Deja_vocab_backend/api/gemini_default_view.py` file

5. Create and apply database migrations
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

6. Create an admin account
   ```bash
   python manage.py createsuperuser
   ```
   Follow the prompts to enter a username, email, and password to create an admin account.

7. Run the development server
   ```bash
   python manage.py runserver
   ```
   You can now access the backend API at `http://127.0.0.1:8000/` and the admin interface at `http://127.0.0.1:8000/admin/`.

### Extension Installation

1. Navigate to the extension directory
   ```bash
   cd ../Deja_vocab_extension
   ```

2. Install dependencies
   ```bash
   npm install
   ```
   This will automatically install all necessary dependencies and create the `node_modules` directory.

3. Development mode (generates the `.wxt` directory and runs a development server)
   ```bash
   npm run dev
   ```
   
   Or build the production version
   ```bash
   npm run build
   ```
   Both commands will automatically generate the `.wxt` directory containing the extension's build files.

4. Load into Chrome
   - Open Chrome browser and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked extension"
   - Select the `dist` directory (if using the `npm run build` command) or the `.wxt/chrome-mv3` directory (if using the `npm run dev` command)

5. Test the extension
   - Open any YouTube video page
   - The extension should automatically activate and begin processing subtitles
   - You can access settings and options by clicking the extension icon in the browser toolbar

## User Guide

1. After installing the extension, open any YouTube video with subtitles
2. The extension will automatically activate and load subtitles (the Déjà Vocab panel will appear on the right side of the page)
3. Hover over words in the subtitles to view definitions (showing meaning, phonetic symbols, and example sentences)
4. Click on a word to hear its pronunciation (the system will play the standard pronunciation)
5. Double-click a word to add it to your collection (the system will automatically record the word and its context)
6. Use the sidebar or full-screen mode to interact with the AI assistant (you can ask questions about language, words, or video content)
7. In new videos, view the automatically displayed list of saved words (see how previously learned words are applied in new contexts)
8. Click on the timestamp next to a saved word to jump to the point in the video where that word appears
9. **Environment Switch**: At the bottom of the extension panel, you can switch between environments
   - **Local Development** (default): Connects to a locally running backend server (http://localhost:8000)
   - **Production Environment**: Connects to the deployed online service

## Technical Dependencies

### Backend

- **Django & Django REST Framework**: Provides robust API infrastructure
- **Google Gemini AI**: Powers the intelligent learning assistant features
- **YouTube Transcript API**: Retrieves and processes video subtitles
- **spaCy NLP**: Natural language processing and text analysis
- **SQLite/PostgreSQL**: Data storage and management

### Frontend

- **Vue.js**: Builds responsive user interfaces
- **TypeScript**: Provides type safety and development efficiency
- **WXT (Web Extension Toolkit)**: Simplifies browser extension development
- **Vite**: Fast frontend build tool

## Future Enhancement Plans

### Near-term Plans

- **Multilingual Support**: Add translation capabilities between more languages to support a wider range of learners
- **Smart Phrase Recognition**: Automatically identify important phrases and idioms, not just individual words
- **Learning Progress Tracking**: Record which videos and phrases you've studied, providing learning statistics and recommendations

### Mid-term Plans

- **Export/Import Functionality**: Share vocabulary libraries or export for offline study
- **Support for Other Platforms**: Extend support to Netflix, Bilibili, and other video platforms
- **Community Learning Features**: Create a community where learners can share notes and collections

### Long-term Vision

- **Personalized Learning Paths**: Automatically recommend video content based on user level and goals
- **Speech Recognition Practice**: Allow users to mimic pronunciation in videos and receive feedback
- **Augmented Reality Integration**: Extend learning to objects and scenes in real-world environments

## Contribution Guidelines

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards

- Backend code follows PEP 8 Python style guide
- Frontend code follows ESLint configured rules
- All new features must include corresponding tests
- Commit messages should clearly describe the changes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## Contact

- Project Maintainer: Stevelonng
- Project Repository: [https://github.com/Stevelonng/OpenDejaVocab](https://github.com/Stevelonng/OpenDejaVocab)
- Issue Reporting: Please use GitHub Issues to report any issues or suggestions
