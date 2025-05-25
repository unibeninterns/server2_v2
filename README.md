# DRID Server v2

This is the backend server for the DRID application.

## Running the Project

To run this project, you need to have Node.js and MongoDB installed.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/unibeninterns/drid-server2-v2.git
    cd drid-server2-v2
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:**
    Create a `.env` file in the root directory based on `.env.example` and fill in the required values, especially `MONGODB_URI`.
4.  **Run the database migrations/seeders (if any):**
    (Add instructions here if applicable)
5.  **Run the main application:**
    ```bash
    npm start
    # or for development with hot-reloading
    npm run dev
    ```
6.  **Run the Agenda worker:**
    For background job processing (like AI reviews), you need to run the Agenda worker in a separate terminal:
    ```bash
    npm run worker
    ```

## AI Review Background Processing

This project uses Agenda to run the AI review generation in the background. The `npm run worker` command starts a process that listens for and processes these jobs from the database queue. It is necessary to run this worker alongside the main application for AI reviews to be generated automatically.

(Add other sections like API documentation, testing, etc. as needed)
