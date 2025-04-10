<div align="center">
  <h3>📚 Learn a language while watching YouTube videos you love! 📚</h3>
</div>
<div align="center">
  <img src="backend/static/images/deja-logo.jpg" alt="Déjà Vocab Logo" width="100%">
  <p>Automatically captures video subtitles, builds your personal vocabulary, answers questions with AI in real-time, and enhances your language skills while you enjoy videos. - Created with Vibe Coding</p>
  
  <p>
    <a href="https://chromewebstore.google.com/detail/deja-vocab/fgoacfcjfdnjgiamkgphccmhcieibmgh">
      <img src="https://img.shields.io/badge/Chrome-Add%20to%20Chrome-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Add to Chrome">
    </a>
  </p>
  
  <p>
    <a href="https://github.com/Stevelonng/OpenDejaVocab/stargazers">
      <img alt="GitHub Stars" src="https://img.shields.io/github/stars/Stevelonng/OpenDejaVocab?style=flat&logo=github">
    </a>
    <a href="https://github.com/Stevelonng/OpenDejaVocab/network/members">
      <img alt="GitHub Forks" src="https://img.shields.io/github/forks/Stevelonng/OpenDejaVocab?style=flat&logo=github">
    </a>
    <a href="https://github.com/Stevelonng/OpenDejaVocab/issues">
      <img alt="GitHub Issues" src="https://img.shields.io/github/issues/Stevelonng/OpenDejaVocab?style=flat&logo=github">
    </a>
    <a href="https://github.com/Stevelonng/OpenDejaVocab/blob/main/LICENSE">
      <img alt="License" src="https://img.shields.io/github/license/Stevelonng/OpenDejaVocab?style=flat&logo=apache">
    </a>
  </p>
  <p>
    <b><a href="#">English</a></b> | 
    <a href="README.zh.md">中文</a>
  </p>
</div>

---
<h3 align="center"><i>Aiming to build the ultimate language learning ecosystem</i></h3>



## 🚀 Quick Start

<details open>
  <summary><b>👆 Click to Install</b></summary>
  <ol>
    <li>Install Déjà Vocab from the <a href="https://chromewebstore.google.com/detail/deja-vocab/fgoacfcjfdnjgiamkgphccmhcieibmgh">Chrome Web Store</a></li>
    <li>Open any YouTube video</li>
    <li>Hover over words in subtitles to see definitions</li>
    <li>Click on words to hear pronunciation</li>
    <li>Double-click to save words to your personal vocabulary</li>
    <li>Use the AI assistant for any language questions</li>
  </ol>
</details>

## ✨ Core Features

<details open>
  <summary><b>1. Interactive Vocabulary Learning</b></summary>
  <ul>
    <li><b>Hover for definitions</b> • <b>Click for pronunciation</b> • <b>Double-click to save</b></li>
  </ul>
</details>

<details>
  <summary><b>2. Smart Video Integration</b></summary>
  <ul>
    <li><b>Auto-detect saved words</b> • <b>Context display</b> • <b>One-click navigation</b></li>
  </ul>
</details>

<details>
  <summary><b>3. AI Language Assistant</b></summary>
  <ul>
    <li><b>Contextual explanations</b> • <b>Language guidance</b> • <b>Personalized help</b></li>
  </ul>
</details>

## ✨ Core Features

<details>
  <summary><b>Special Thanks</b></summary>
  <p>This project leverages <a href="https://github.com/mem0ai/mem0">mem0</a> for memory and context management.</p>
</details>

## 📥 Installation and Setup

<details>
  <summary><b>Prerequisites</b></summary>
  <ul>
    <li>Python 3.9 or higher</li>
    <li>Node.js and npm</li>
    <li>Chrome browser</li>
    <li>Google Gemini API key</li>
  </ul>
</details>

<details>
  <summary><b>Backend Setup</b></summary>
  
  ```bash
  # Clone the repository
  git clone https://github.com/Stevelonng/OpenDejaVocab.git
  cd OpenDejaVocab
  
  # Install Python dependencies
  pip install -r requirements.txt
  
  # Run database migrations
  cd backend
  python manage.py migrate
  
  # Configure Google Gemini API key
  # Open backend/api/gemini_views.py and backend/api/gemini_default_view.py
  # Replace YOUR_API_KEY with your actual key
  
  # Start the Django server
  python manage.py runserver
  ```
</details>

<details>
  <summary><b>Chrome Extension Setup</b></summary>
  
  ```bash
  # Navigate to extension directory
  cd extension
  
  # Install dependencies
  npm install
  
  # Build the extension
  npm run build
  
  # Load in Chrome:
  # 1. Open chrome://extensions/
  # 2. Enable Developer mode
  # 3. Click "Load unpacked" and select the dist folder
  ```
</details>

## 👥 Contributing

We welcome contributions to Déjà Vocab! Check out our [contribution guidelines](CONTRIBUTING.md) to get started.

<div align="center">
  <img src="https://img.shields.io/badge/⭐-Star_if_useful-yellow?style=for-the-badge" alt="Star if useful">
</div>

## ⭐Star History

<a href="https://www.star-history.com/#Stevelonng/OpenDejaVocab&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Stevelonng/OpenDejaVocab&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Stevelonng/OpenDejaVocab&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Stevelonng/OpenDejaVocab&type=Date" />
 </picture>
</a>

## 📜 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 📬 Contact

- **Project Maintainer**: Stevelonng
- **Repository**: [https://github.com/Stevelonng/OpenDejaVocab](https://github.com/Stevelonng/OpenDejaVocab)
- **Issues**: Please use the [GitHub Issues](https://github.com/Stevelonng/OpenDejaVocab/issues) feature for bug reports and feature requests

---

<div align="center">
  <p>If you find Déjà Vocab useful, please consider giving it a ⭐ on GitHub!</p>
  <p>
    <a href="https://github.com/Stevelonng/OpenDejaVocab">
      <img src="https://img.shields.io/github/stars/Stevelonng/OpenDejaVocab?style=social" alt="GitHub stars">
    </a>
  </p>
</div>
