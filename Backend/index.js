const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// Using 'mysql2/promise' for reliable MySQL connection
const mysql = require('mysql2/promise'); 
// Using '@sendgrid/mail' for reliable email sending
const sgMail = require('@sendgrid/mail');
const jwt = require('jsonwebtoken');

// --- Environment Variables Setup (Mandatory for Railway) ---
const PORT = process.env.PORT || 3000;

// MySQL Database Credentials
const { 
    MYSQL_HOST, 
    MYSQL_USER, 
    MYSQL_PASSWORD, 
    MYSQL_DATABASE,
    MYSQL_PORT
} = process.env; 

// Admin Credentials
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
// IMPORTANT: This must be a long, random, cryptographically secure key
const JWT_SECRET = process.env.JWT_SECRET || 'DO_NOT_USE_THIS_IN_PRODUCTION_CHANGE_IT_NOW';

// SendGrid Mail Configuration
// EMAIL_PASS holds the SendGrid API Key (starts with SG.)
const SENDGRID_API_KEY = process.env.EMAIL_PASS; 
// The recipient of the submission notification
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
// The email address verified in your SendGrid account (the "From" address)
const SENDGRID_SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL || 'default@example.com'; 

// Frontend URL for CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://service-request-app-production.up.railway.app'; 

// --- SendGrid Initialization ---
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log('✅ SendGrid API Key set successfully. Email service ready.');
} else {
    console.error('❌ CRITICAL: SENDGRID_API_KEY (environment variable EMAIL_PASS) is missing. Email notifications will fail.');
}
// ---

// Database Connection Pool (MySQL)
let pool;

const app = express();

// Middleware
app.use(cors({
    origin: FRONTEND_URL, 
    credentials: true,
}));
app.use(bodyParser.json());

// --- Database Initialization: Create table if it doesn't exist ---
async function initDb() {
    try {
        if (!MYSQL_HOST || !MYSQL_DATABASE) {
            console.error('❌ CRITICAL: Missing essential MySQL environment variables (HOST, DATABASE). Cannot connect.');
            return;
        }

        pool = mysql.createPool({
            host: MYSQL_HOST, 
            port: MYSQL_PORT ? parseInt(MYSQL_PORT, 10) : 3306, 
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });

        // Check connection and ensure table exists
        const connection = await pool.getConnection();
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS service_requests (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                contact_number VARCHAR(50),
                service VARCHAR(100),
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await connection.execute(createTableQuery);
        connection.release();
        console.log('✅ MySQL Database initialized successfully: service_requests table checked/created.');
    } catch (error) {
        console.error('❌ Error initializing MySQL database. Check ENV variables:', error);
        // Exit process if DB connection is impossible, as the app is unusable without it
        process.exit(1); 
    }
}

// Function to send email using the direct SendGrid SDK
const sendNotificationEmail = async (submissionData) => {
    const { name, contact_number, service, description } = submissionData;

    if (!SENDGRID_API_KEY) {
        throw new Error('SendGrid API Key is not configured (EMAIL_PASS is empty).');
    }

    const msg = {
        to: ADMIN_EMAIL, 
        // Must be the verified single sender email address
        from: SENDGRID_SENDER_EMAIL, 
        subject: `New Service Request: ${service}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
                <h2 style="color: #333;">New Request from ${name}</h2>
                <p>A new service request has been submitted through the form.</p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p><strong>Contact Number:</strong> ${contact_number}</p>
                <p><strong>Service Type:</strong> ${service}</p>
                <p><strong>Project Description:</strong></p>
                <div style="padding: 10px; border: 1px solid #ccc; background-color: #f9f9f9;">
                    ${description}
                </div>
                <p style="margin-top: 20px; font-size: 0.9em; color: #777;">
                    Please log into the admin dashboard to review.
                </p>
            </div>
        `,
    };

    try {
        await sgMail.send(msg);
        console.log(`✅ Email notification sent successfully to ${ADMIN_EMAIL}`);
    } catch (error) {
        console.error('--- ERROR: FAILED TO SEND EMAIL (SendGrid SDK) ---');
        if (error.response) {
            console.error('Response Status:', error.response.statusCode);
            // Log response body for debugging specific SendGrid errors (e.g., unauthorized)
            console.error('Response Body:', error.response.body); 
        }
        console.error('Error Message:', error.message); 
        console.error('-------------------------------------');
        throw new Error('Failed to send email via SendGrid');
    }
};

// --- API Endpoints ---

// 1. POST /api/form - Handle new service request submission (Non-Blocking Email)
app.post('/api/form', async (req, res) => {
    const { fullName, contactNumber, serviceType, projectDescription } = req.body;

    if (!fullName || !contactNumber || !serviceType || !projectDescription) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        // 1. SAVE DATA to MySQL
        const query = 'INSERT INTO service_requests(name, contact_number, service, description) VALUES(?, ?, ?, ?)';
        const [result] = await pool.execute(
            query,
            [fullName, contactNumber, serviceType, projectDescription]
        );

        const newSubmissionId = result.insertId;

        // 2. RESPOND IMMEDIATELY TO THE CLIENT
        res.status(201).json({ 
            message: 'Submission successful. You will be contacted soon.', 
            data: { id: newSubmissionId } // Return the new ID
        });

        // 3. ASYNCHRONOUSLY SEND EMAIL (Non-blocking background task)
        sendNotificationEmail({
            name: fullName,
            contact_number: contactNumber,
            service: serviceType,
            description: projectDescription,
        })
        .then(() => console.log('✅ Asynchronous email notification finished.'))
        .catch((emailError) => console.error('❌ Asynchronous email failed after successful DB save:', emailError.message));

    } catch (error) {
        console.error('❌ Error during form submission (DB failure):', error);
        res.status(500).json({ message: 'Internal server error during database operation.' });
    }
});

// --- Admin Authentication and Authorization ---

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Expects 'Bearer TOKEN'

    if (token == null) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden (Invalid token)
        req.user = user;
        next();
    });
};

// 2. POST /api/admin/login - Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    // Use credentials from environment variables
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const user = { username: ADMIN_USERNAME };
        const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token: accessToken });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// 3. GET /api/forms - Retrieve all submissions (Admin protected)
app.get('/api/forms', authenticateToken, async (req, res) => {
    try {
        // Order by creation time, descending
        const query = 'SELECT * FROM service_requests ORDER BY created_at DESC';
        const [rows] = await pool.execute(query);
        
        // Match the frontend's expected structure (Id capital I)
        const submissions = rows.map(row => ({
            ...row,
            Id: row.Id 
        }));

        res.json(submissions);
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ message: 'Internal server error fetching data.' });
    }
});

// 4. POST /api/forms/:id/resend - Resend email notification (Admin protected)
app.post('/api/forms/:id/resend', authenticateToken, async (req, res) => {
    const submissionId = req.params.id;

    try {
        const query = 'SELECT * FROM service_requests WHERE Id = ?';
        const [rows] = await pool.execute(query, [submissionId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Submission not found.' });
        }

        const submission = rows[0];

        // Resend the notification
        await sendNotificationEmail({
            name: submission.name,
            contact_number: submission.contact_number,
            service: submission.service,
            description: submission.description,
        });

        res.status(200).json({ message: 'Email successfully resent.' });
    } catch (error) {
        console.error('Error during resend operation:', error);
        
        // Ensure error message is passed to the frontend
        res.status(500).json({ 
            message: error.message || 'Failed to resend email. Check backend logs for API failure details.',
            error: error.message
        });
    }
});


// Start server and initialize DB
app.listen(PORT, async () => {
    await initDb();
    console.log(`Server running on port ${PORT}`);
});
