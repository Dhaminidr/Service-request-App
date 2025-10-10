const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// --- NEW: Using the direct SendGrid SDK (Requires package @sendgrid/mail) ---
const sgMail = require('@sendgrid/mail');
// ---

// --- Environment Variables Setup (Mandatory for Railway) ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// SendGrid Mail Configuration
const SENDGRID_SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL || 'default@example.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
// EMAIL_PASS now holds the SendGrid API Key (starts with SG.)
const SENDGRID_API_KEY = process.env.EMAIL_PASS;

// --- SendGrid Initialization ---
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log('✅ SendGrid API Key set successfully. Ready to send via HTTP API.');
} else {
    console.error('❌ CRITICAL: SENDGRID_API_KEY (environment variable EMAIL_PASS) is missing.');
}
// ---

// Database Connection Pool (PostgreSQL using 'pg')
const pool = new Pool({
    connectionString: DATABASE_URL,
});

const app = express();

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(bodyParser.json());

// --- Database Initialization ---
async function initDb() {
    try {
        const client = await pool.connect();
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS service_requests (
                Id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                contact_number VARCHAR(50),
                service VARCHAR(100),
                description TEXT,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createTableQuery);
        client.release();
        console.log('Database initialized successfully: service_requests table checked/created.');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Function to send email using the direct SendGrid SDK
const sendNotificationEmail = async (submissionData) => {
    const { name, contact_number, service, description } = submissionData;

    if (!SENDGRID_API_KEY) {
        throw new Error('SendGrid API Key is not configured.');
    }

    const msg = {
        to: ADMIN_EMAIL, 
        // Must be a verified single sender in SendGrid
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
        // Send email via SendGrid HTTP API call (bypassing SMTP)
        await sgMail.send(msg);
        console.log(`✅ Email notification sent successfully to ${ADMIN_EMAIL}`);
    } catch (error) {
        console.error('--- ERROR: FAILED TO SEND EMAIL (SendGrid SDK) ---');
        // Log the specific error details from SendGrid
        if (error.response) {
            console.error('Response Status:', error.response.statusCode);
            // Response body can contain specific error messages from SendGrid
            console.error('Response Body:', error.response.body); 
        }
        console.error('Error Message:', error.message); 
        console.error('-------------------------------------');
        throw new Error('Failed to send email');
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
        // 1. SAVE DATA
        const client = await pool.connect();
        const result = await client.query(
            'INSERT INTO service_requests(name, contact_number, service, description) VALUES($1, $2, $3, $4) RETURNING *',
            [fullName, contactNumber, serviceType, projectDescription]
        );
        client.release();

        const newSubmission = result.rows[0];

        // 2. RESPOND IMMEDIATELY TO THE CLIENT FOR FAST UI RESPONSE
        res.status(201).json({ 
            message: 'Submission successful. You will be contacted soon.', 
            data: newSubmission 
        });

        // 3. ASYNCHRONOUSLY SEND EMAIL (Non-blocking background task)
        sendNotificationEmail({
            name: newSubmission.name,
            contact_number: newSubmission.contact_number,
            service: newSubmission.service,
            description: newSubmission.description,
        })
        .then(() => console.log('✅ Asynchronous email notification finished.'))
        .catch((emailError) => console.error('❌ Asynchronous email failed after successful DB save:', emailError.message));

    } catch (error) {
        console.error('Error during form submission (DB failure):', error);
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
        const client = await pool.connect();
        // Order by creation time, descending
        const result = await client.query('SELECT * FROM service_requests ORDER BY created_at DESC');
        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ message: 'Internal server error fetching data.' });
    }
});

// 4. POST /api/forms/:id/resend - Resend email notification (Admin protected)
app.post('/api/forms/:id/resend', authenticateToken, async (req, res) => {
    const submissionId = req.params.id;

    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM service_requests WHERE Id = $1', [submissionId]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Submission not found.' });
        }

        const submission = result.rows[0];

        await sendNotificationEmail({
            name: submission.name,
            contact_number: submission.contact_number,
            service: submission.service,
            description: submission.description,
        });

        res.status(200).json({ message: 'Email successfully resent.' });
    } catch (error) {
        console.error('Error during resend operation:', error);
        
        // This catches the error thrown by sendNotificationEmail, ensuring the frontend gets the error message
        res.status(500).json({ 
            message: 'Failed to resend email. Check backend logs for API failure details.',
            error: error.message
        });
    }
});


// Start server and initialize DB
app.listen(PORT, async () => {
    await initDb();
    console.log(`Server running on port ${PORT}`);
});

