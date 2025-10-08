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
// EMAIL_USER and EMAIL_PASS are used here for Gmail
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS; 

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
            const mailOptions = {
                // SENDER EMAIL must be the same as EMAIL_USER
                from: `"New Submission" <${EMAIL_USER}>`, 
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
            
            // Nodemailer configuration: REVERTED TO GMAIL (Port 587) + INCREASED TIMEOUT
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587, 
                secure: false, // Must be false for port 587
                requireTLS: true, // Explicitly enable TLS
                connectionTimeout: 10000, // INCREASED TIMEOUT to 10 seconds (default is 5s)
                auth: {
                    user: EMAIL_USER,
                    pass: EMAIL_PASS, 
                },
            });

            try {
                await transporter.sendMail(mailOptions);
                console.log('Email sent successfully!');
            } catch (error) {
                console.error('--- ERROR: FAILED TO SEND EMAIL ---');
                // The error here should now be a clear password/authentication error if it's not a timeout
                console.error(error); 
                console.error('-------------------------------------');
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
                    created_at: new Date(submission.created_at).toLocaleString(),
                };

                await sendSubmissionEmail(emailData);

                res.status(200).json({ message: 'Email resent successfully!' });
            } catch (error) {
                console.error('❌ Failed to resend email:', error);
                res.status(500).json({ message: 'Failed to resend email' });
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
