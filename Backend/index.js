process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
// IMPORTANT: We are replacing Nodemailer with the official SendGrid package for API use.
// const nodemailer = require('nodemailer'); 
const sgMail = require('@sendgrid/mail'); // Requires '@sendgrid/mail' package
const mysql = require('mysql2/promise');
const cors = require('cors');
// NOTE: .env is only used in local development. For Railway, all variables 
// must be added directly to the Railway service's Variables tab.
require('dotenv').config({ path: '.env' }); 

const app = express(); 
const port = 5000;

// IMPORTANT: Define the correct table name
const DB_TABLE_NAME = 'service_requests';

const FRONTEND_URL = 'https://glorious-enthusiasm-production.up.railway.app'; 


app.use(cors({
    origin: FRONTEND_URL, 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));


// Get credentials from process.env (Railway Variables)
const { 
    MYSQL_HOST, 
    MYSQL_USER, 
    MYSQL_PASSWORD, 
    MYSQL_DATABASE,
    MYSQL_PORT
} = process.env; 
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
// EMAIL_PASS MUST be the SendGrid API Key (starts with SG.)
const SENDGRID_API_KEY = process.env.EMAIL_PASS; 

// Set the SendGrid API Key using the repurposed EMAIL_PASS variable
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log('✅ SendGrid API Key loaded.');
} else {
    console.error('❌ SENDGRID_API_KEY (from EMAIL_PASS) is missing. Email will fail.');
}


// Connect to MySQL database
let pool;
async function startServer() {
    try {
        
        pool = mysql.createPool({
            // MUST be the INTERNAL Railway Hostname (e.g., mysqldb.internal)
            host: MYSQL_HOST, 
            // Use the port provided by Railway, or 3306 as the common internal port
            port: MYSQL_PORT ? parseInt(MYSQL_PORT, 10) : 3306, 
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });

        // Check the connection by executing a simple query
        await pool.getConnection();
        console.log('✅ MySQL connected successfully!');
        
        // Middleware
        app.use(bodyParser.json());
    

        // Admin credentials (for simplicity)
        const adminUser = {
            username: 'admin',
            password: 'admin_password', // Change this in a real application!
        };

        // Authentication Middleware
        const auth = (req, res, next) => {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                req.userData = decoded;
                next();
            } catch (error) {
                return res.status(401).json({ message: 'Authentication failed!' });
            }
        };

        const sendSubmissionEmail = async (submission) => {
            if (!SENDGRID_API_KEY) {
                console.error('Email skipped: SendGrid API Key not configured.');
                throw new Error('Email service not configured.');
            }
            
            const msg = {
                // IMPORTANT: The 'from' email MUST be verified in your SendGrid account.
                to: ADMIN_EMAIL, // Recipient email address
                from: ADMIN_EMAIL, // Must be your single verified sender email in SendGrid
                subject: `New Form Submission: ${String(submission.service)}`,
                html: `
                    <h2>New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${String(submission.name)}</p>
                    <p><strong>Contact Number:</strong> ${String(submission.contact_number)}</p>
                    <p><strong>Service:</strong> ${String(submission.service)}</p>
                    <p><strong>Description:</strong> ${String(submission.description)}</p>
                    <p><strong>Submission Date:</strong> ${String(submission.created_at)}</p>
                `,
            };
            
            try {
                // Uses the SendGrid API (HTTPS/443), bypassing the SMTP firewall issue
                await sgMail.send(msg);
                console.log('Email sent successfully via SendGrid API!');
            } catch (error) {
                console.error('--- ERROR: FAILED TO SEND EMAIL VIA SENDGRID API ---');
                // Now, if it fails, it will likely be an AUTH error (401) or a sender verification error.
                console.error('API Error details:', error.response ? error.response.body.errors : error.message); 
                console.error('----------------------------------------------------');
                throw new Error('Failed to send email');
            }
        };

        // Routes
        app.post('/api/form', async (req, res) => {
            console.log('Received a POST request to /api/form');
            try {
                const { fullName, contactNumber, serviceType, projectDescription } = req.body;
                const currentDate = new Date();
                const submissionData = [fullName, contactNumber, serviceType, projectDescription, currentDate];
                // FIXED: Use the correct table name 'service_requests'
                const query = `INSERT INTO ${DB_TABLE_NAME} (name, contact_number, service, description, created_at) VALUES (?, ?, ?, ?, ?)`;

                // 1. SAVE DATA (This has been consistently working)
                await pool.execute(query, submissionData);
                console.log('✅ Form data saved to database successfully!');

                // 2. RESPOND IMMEDIATELY (Non-blocking)
                res.status(200).json({ message: 'Form submitted successfully!' });

                // 3. ASYNCHRONOUSLY SEND EMAIL (Non-blocking background task)
                const emailData = {
                    name: fullName,
                    contact_number: contactNumber,
                    service: serviceType,
                    description: projectDescription,
                    created_at: currentDate,
                };
                
                // We use .then/.catch here and DON'T await, so the response isn't blocked.
                sendSubmissionEmail(emailData) 
                    .then(() => console.log('✅ Asynchronous email notification sent!'))
                    .catch((emailError) => console.error('❌ Asynchronous email failed:', emailError.message));
                
            } catch (error) {
                console.error('❌ CRITICAL Submission error (DB Failure):', error);
                // This block is executed if DB connection/write fails.
                res.status(500).json({ message: 'Error submitting form. Please check backend logs (DB issue).' });
            }
        });

        app.post('/api/admin/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                if (username === adminUser.username && password === adminUser.password) {
                    const token = jwt.sign({ username: adminUser.username }, JWT_SECRET, { expiresIn: '1h' });
                    return res.status(200).json({ token });
                }
                res.status(401).json({ message: 'Invalid credentials' });
            } catch (error) {
                res.status(500).json({ message: 'Login failed' });
            }
        });

        app.get('/api/forms', auth, async (req, res) => {
            try {
                // FIXED: Use the correct table name 'service_requests'
                const query = `SELECT * FROM ${DB_TABLE_NAME} ORDER BY created_at DESC`;
                const [rows] = await pool.execute(query);
                res.status(200).json(rows);
            } catch (error) {
                console.error('❌ Failed to fetch submissions:', error);
                res.status(500).json({ message: 'Failed to fetch submissions' });
            }
        });

        app.post('/api/forms/:id/resend', auth, async (req, res) => {
            try {
                // FIXED: Use the correct table name 'service_requests'
                const query = `SELECT * FROM ${DB_TABLE_NAME} WHERE Id = ?`;
                const [rows] = await pool.execute(query, [req.params.id]);
                const submission = rows[0];

                if (!submission) {
                    return res.status(404).json({ message: 'Submission not found' });
                }

                const emailData = {
                    name: submission.name,
                    contact_number: submission.contact_number,
                    service: submission.service,
                    description: submission.description,
                    created_at: new Date(submission.created_at).toLocaleString(),
                };

                await sendSubmissionEmail(emailData);

                res.status(200).json({ message: 'Email resent successfully!' });
            } catch (error) {
                console.error('❌ Failed to resend email:', error);
                // This will send the 500 status to the frontend, which should trigger an error pop-up
                res.status(500).json({ message: 'Failed to resend email. Check backend logs for API key or sender verification error.' });
            }
        });

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });

    } catch (error) {
        console.error('❌ Failed to connect to MySQL:', error);
        process.exit(1);
    }
}

startServer();
