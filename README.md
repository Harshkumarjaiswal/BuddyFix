# Hack-a-Problem: Crowdsourced Problem-Solving Platform

A modern web application that enables communities to report, discuss, and solve real-world problems collaboratively. The platform leverages AI to suggest solutions based on similar past problems and includes features for community voting and authority notifications.

## 🌟 Features

- **Problem Submission with Location**
  - Report problems with detailed descriptions
  - Automatic location detection
  - Category classification

- **AI-Powered Solution Suggestions**
  - Gemini AI integration for intelligent solution recommendations
  - Analysis of similar past problems and solutions

- **Community Engagement**
  - Upvote/downvote system
  - Discussion threads for each problem
  - Solution proposals from community members

- **Real-Time Notifications**
  - SMS alerts to authorities for high-priority issues
  - Status updates for problem resolution

## 🔧 Tech Stack

- **Frontend**: HTML, CSS (Bootstrap), JavaScript
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **APIs**:
  - Gemini AI API for solution suggestions
  - Geolocation API for location tracking
  - Twilio API for SMS notifications

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB
- API Keys for:
  - Gemini AI
  - Twilio

## 🚀 Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hack-a-problem
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/hack-a-problem
   
   ```

4. **Start the application**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 📱 Usage

1. **Submitting a Problem**
   - Click "Submit Problem" in the navigation
   - Fill in the problem details
   - Your location will be automatically detected
   - Submit the form

2. **Viewing Problems**
   - Browse the problems list on the homepage
   - Click on a problem card to view details
   - See AI-suggested solutions
   - View community discussions

3. **Contributing Solutions**
   - Open a problem's details
   - Add your solution in the solution form
   - Vote on existing solutions

4. **Problem Status**
   - Problems can be marked as:
     - Pending
     - In Progress
     - Solved

## 🔒 Security Notes

- API keys are stored securely in environment variables
- User input is sanitized to prevent XSS attacks
- CORS is configured for API security

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Authors

- [Your Name] - Initial work

## 🙏 Acknowledgments

- Gemini AI for providing the AI solution suggestions
- Twilio for SMS notification capabilities
- OpenStreetMap for reverse geocoding services 