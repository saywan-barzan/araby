# Fêrbûna Erebî (Arabic Learning)

This is an interactive web application designed to help Kurdish speakers learn the 5000 most important Arabic words through flashcards.

## Local Development Setup

This project uses [Vite](https://vitejs.dev/) for a fast local development experience.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or newer)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Running the Application

1.  **Clone the repository or download the files.**

2.  **Install dependencies:**
    Open your terminal in the project's root directory and run:
    ```bash
    npm install
    ```

3.  **Set up your API Key:**
    The application requires a Google Gemini API key to function.
    - Create a file named `.env` in the root of the project.
    - Add your API key to the file like this:
      ```
      API_KEY=YOUR_GEMINI_API_KEY
      ```
    Replace `YOUR_GEMINI_API_KEY` with your actual key. You can get a key from [Google AI Studio](https://aistudio.google.com/app/apikey).

4.  **Start the development server:**
    Run the following command in your terminal:
    ```bash
    npm run dev
    ```

5.  **Open the app:**
    Your browser should automatically open to the local development server address (usually `http://localhost:5173`). If not, open this URL manually.

You can now see the application running and make changes to the source code. The page will automatically reload when you save a file.
