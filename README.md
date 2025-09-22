# Service Request Application

This is a full-stack web application designed for managing service requests. It consists of two main parts: a user-facing form for submitting requests and a secure admin dashboard for viewing and managing those submissions.

## Project Structure

-   **`backend/`**: Contains the Node.js/Express server that handles API requests and database interactions.
-   **`frontend/`**: Contains the React application that serves the user interface.

## How to Run the Project (Step-by-Step Guide)

Follow these steps to set up and run the application on your local machine.

### Prerequisites

You need to have the following software installed:

* **Node.js & npm**: Download and install from [nodejs.org](https://nodejs.org/).
* **MySQL**: Ensure you have a running instance of MySQL.
* **A Code Editor**: Such as VS Code.

### Step 1: Backend Setup

1.  **Open your terminal** and navigate to the `backend` directory.
    ```bash
    cd backend
    ```
2.  **Install the server dependencies**:
    ```bash
    npm install
    ```
3.  **Database Configuration**:
    * Create a new MySQL database for the project.
    * Run the following SQL query to create the necessary table:
        ```sql
        CREATE TABLE `submissions` (
          `Id` int NOT NULL AUTO_INCREMENT,
          `name` varchar(225) NOT NULL,
          `contact_number` varchar(255) NOT NULL,
          `service` varchar(255) NOT NULL,
          `description` text NOT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`Id`)
        ) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        ```
    * Create a **`.env`** file inside the `backend` directory and add your database and email credentials. **Do not use the ones you used for the project.** Use their own.
        ```env
        # Database Credentials
        MYSQL_HOST=localhost
        MYSQL_USER=your_mysql_username
        MYSQL_PASSWORD=your_mysql_password
        MYSQL_DATABASE=your_database_name
        
        # Admin Credentials & Secrets
        JWT_SECRET=a_strong_random_secret
        ADMIN_EMAIL=your_email@example.com
        
        # Email Credentials (for notifications)
        EMAIL_USER=your_email@gmail.com
        EMAIL_PASS=your_app_password
        ```
4.  **Start the Backend Server**:
    ```bash
    node index.js
    ```
    The server will start running on `http://localhost:5000`.

### Step 2: Frontend Setup

1.  **Open a new terminal window** and navigate to the `frontend` directory.
    ```bash
    cd ../frontend
    ```
2.  **Install the frontend dependencies**:
    ```bash
    npm install
    ```
3.  **Start the React Application**:
    ```bash
    npm start
    ```
    This will launch the application in your browser at `http://localhost:3000`.

### Accessing the Application

* **User Form**: Available at `http://localhost:3000`.
* **Admin Dashboard**: Available at `http://localhost:3000/admin`.
    * **Login Credentials**: Use `username: admin` and `password: admin_password`.


After running `git push`, your manager can visit your GitHub repository link and will see all your code, along with the `README.md` file that explains exactly how to set up and run the project.
