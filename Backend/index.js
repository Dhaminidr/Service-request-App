process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');
const cors = require('cors');
// NOTE: .env is only used in local development. For Railway, all variables 
// must be added directly to the Railway service's Variables tab.
require('dotenv').config({ path: '.env' }); 

const app = express(); 
const port = 5000;


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
// EMAIL_USER (must be the full Zoho email address) and EMAIL_PASS (must be the Zoho App Password)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS; 
// This should be set in your Railway variables to the verified sender email address
const SENDGRID_SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL; 

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

        // MODIFIED: Updated for Zoho Mail settings.
        const sendSubmissionEmail = async (submission) => {
            
            // CHECK 1: Ensure critical variables are present
            if (!ADMIN_EMAIL || !EMAIL_USER || !EMAIL_PASS || !SENDGRID_SENDER_EMAIL) {
                const missing = [];
                if (!ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
                if (!EMAIL_USER) missing.push('EMAIL_USER (Zoho Email)');
                if (!EMAIL_PASS) missing.push('EMAIL_PASS (Zoho App Password)');
                if (!SENDGRID_SENDER_EMAIL) missing.push('SENDGRID_SENDER_EMAIL (Sender Email)');

                console.error(`❌ Configuration Error: Missing environment variables: ${missing.join(', ')}`);
                // This ensures an error is thrown to be caught by the route handler
                throw new Error(`Email configuration missing: ${missing.join(', ')}`);
            }
            console.log(`🔑 Current EMAIL_PASS length: ${EMAIL_PASS ? EMAIL_PASS.length : 0}`);


            const mailOptions = {
                // NOTE: The sender email must match the EMAIL_USER (your Zoho address)
                from: `"New Submission" <${SENDGRID_SENDER_EMAIL}>`, 
                to: ADMIN_EMAIL, // Recipient email address
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
            
            // Nodemailer configuration: SWITCHED TO ZOHO MAIL
            const transporter = nodemailer.createTransport({
                host: 'smtp.zoho.com', // Zoho Mail Host
                port: 587,  // Standard port for Zoho (requires TLS)
                secure: false, // Use false for port 587
                requireTLS: true,
                timeout: 10000, // Explicit 10 second timeout for debugging
                auth: {
                    // Must be the full Zoho email address (EMAIL_USER)
                    user: EMAIL_USER, 
                    // Must be the Zoho App Password (EMAIL_PASS)
                    pass: EMAIL_PASS, 
                },
            });

            try {
                // CHECK 2: Attempt to send the email
                await transporter.sendMail(mailOptions);
                console.log('Email sent successfully via Zoho Mail!');
            } catch (error) {
                console.error('--- ERROR: FAILED TO SEND EMAIL ---');
                // Log the actual error code and message for better debugging
                console.error(`Error Code: ${error.code || 'N/A'}`);
                console.error(`Error Message: ${error.message}`); 
                console.error('-------------------------------------');
                // Throw the error so the calling route handler can catch it and return a 500
                throw new Error(error.message || 'Failed to send email due to transport error.');
            }
        };

        // Routes
        app.post('/api/form', async (req, res) => {
            console.log('Received a POST request to /api/form');
            try {
                const { fullName, contactNumber, serviceType, projectDescription } = req.body;
                const currentDate = new Date();
                const submissionData = [fullName, contactNumber, serviceType, projectDescription, currentDate];
                const query = 'INSERT INTO submissions (name, contact_number, service, description, created_at) VALUES (?, ?, ?, ?, ?)';

                // 1. SAVE DATA
                await pool.execute(query, submissionData);
                console.log('✅ Form data saved to database successfully!');

                // 2. RESPOND IMMEDIATELY (Fixes the slow pop-up/no pop-up issue)
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
                const query = 'SELECT * FROM submissions ORDER BY created_at DESC';
                const [rows] = await pool.execute(query);
                res.status(200).json(rows);
            } catch (error) {
                console.error('❌ Failed to fetch submissions:', error);
                res.status(500).json({ message: 'Failed to fetch submissions' });
            }
        });

        app.post('/api/forms/:id/resend', auth, async (req, res) => {
            try {
                const query = 'SELECT * FROM submissions WHERE Id = ?';
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
                    // Use a more readable local string format for the resend
                    created_at: new Date(submission.created_at).toLocaleString(), 
                };

                // The entire route relies on the corrected sendSubmissionEmail function
                await sendSubmissionEmail(emailData);

                res.status(200).json({ message: 'Email resent successfully!' });
            } catch (error) {
                console.error('❌ Failed to resend email:', error);
                // The message returned to the frontend now includes the specific error.
                res.status(500).json({ message: `Mail Resend Failed: ${error.message || 'Unknown server error.'}` });
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
