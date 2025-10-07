import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

// Reusable Status Message Component (Replaces alert())
const StatusMessage = ({ message, type, onClose }) => {
    if (!message) return null;

    return (
        <div 
            // Position the message at the top center
            className={`alert alert-${type} alert-dismissible fade show fixed-top mx-auto mt-3`}
            role="alert"
            style={{ maxWidth: '400px', zIndex: 1050 }}
        >
            {message}
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
        </div>
    );
};

// Home Page Component
const HomePage = ({ showStatus }) => {
    const [formData, setFormData] = useState({
        fullName: '',
        contactNumber: '',
        serviceType: '',
        projectDescription: '',
    });

    const handleInputChange = (event) => {
        const { id, value } = event.target;
        setFormData(prevData => ({
            ...prevData,
            [id]: value
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        console.log('Sending Form Data:', formData);
        try {
            const response = await axios.post('https://service-request-app-production.up.railway.app/api/form', {
                fullName: formData.fullName,
                contactNumber: formData.contactNumber,
                serviceType: formData.serviceType,
                projectDescription: formData.projectDescription,
            });

            if (response.status === 200) {
                showStatus('Form submitted successfully! You will be contacted soon.', 'success');
                setFormData({
                    fullName: '',
                    contactNumber: '',
                    serviceType: '',
                    projectDescription: '',
                });
            } else {
                showStatus('Error submitting form. Status: ' + response.status, 'danger');
            }
        } catch (error) {
            console.error('Error:', error);
            showStatus('An unexpected error occurred while submitting the form.', 'danger');
        }
    };

    return (
        <div className="container my-5">
            <div className="row justify-content-center">
                <div className="col-md-8 col-lg-6 text-center">
                    <h1 className="display-5 fw-bold text-primary">Professional Services</h1>
                    <p className="fs-5 text-muted mb-4">
                        Transform your ideas into reality with our expert services in web development, AI/ML solutions, and professional training programs.
                    </p>
                </div>
            </div>
            <div className="row justify-content-center">
                <div className="col-md-8 col-lg-6">
                    <div className="card shadow-lg border-0 rounded-3">
                        <div className="card-body p-4 p-md-5">
                            <h2 className="card-title text-center mb-4 text-secondary">Service Request Form</h2>
                            <p className="text-center text-muted mb-4">
                                Tell us about your project and we'll help bring your vision to life.
                            </p>
                            <form onSubmit={handleSubmit}>
                                <div className="mb-3">
                                    <label htmlFor="fullName" className="form-label">Full Name</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="fullName"
                                        value={formData.fullName}
                                        onChange={handleInputChange}
                                        placeholder="Enter your full name"
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="contactNumber" className="form-label">Contact Number</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="contactNumber"
                                        value={formData.contactNumber}
                                        onChange={handleInputChange}
                                        placeholder="+1 (555) 123-4567"
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="serviceType" className="form-label">Service Type</label>
                                    <select
                                        className="form-select"
                                        id="serviceType"
                                        value={formData.serviceType}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        <option value="" disabled>Select a service</option>
                                        <option>Training</option>
                                        <option>Web Development</option>
                                        <option>AI/ML</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className="mb-4">
                                    <label htmlFor="projectDescription" className="form-label">Project Description</label>
                                    <textarea
                                        className="form-control"
                                        id="projectDescription"
                                        rows="4"
                                        value={formData.projectDescription}
                                        onChange={handleInputChange}
                                        placeholder="Please describe your project requirements, timeline, and any specific needs..."
                                        required
                                    />
                                </div>
                                <div className="d-grid gap-2">
                                    <button type="submit" className="btn btn-primary btn-lg rounded-pill">
                                        Submit Request
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Admin Dashboard Component
const AdminPage = ({ showStatus }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submissions, setSubmissions] = useState([]);
    const navigate = useNavigate();

    // handleLogout is defined with useCallback to avoid dependency issues in fetchSubmissions
    const handleLogout = useCallback(() => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setSubmissions([]); // Clear data on logout
        navigate('/admin');
        showStatus('Logged out successfully.', 'info');
    }, [navigate, showStatus]);

    const fetchSubmissions = useCallback(async (token) => {
        try {
            const response = await axios.get('https://service-request-app-production.up.railway.app/api/forms', {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.status === 200) {
                const formattedSubmissions = response.data.map(item => ({
                    id: item.Id,
                    fullName: item.name,
                    contactNumber: item.contact_number,
                    serviceType: item.service,
                    projectDescription: item.description,
                    // Format date nicely
                    createdAt: item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A',
                }));
                setSubmissions(formattedSubmissions);
            } else {
                showStatus('Failed to fetch submissions. Please log in again.', 'warning');
                handleLogout();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showStatus('Failed to fetch submissions. Check network or server status.', 'danger');
            handleLogout();
        }
    }, [handleLogout, showStatus]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            setIsLoggedIn(true);
            fetchSubmissions(token);
        }
    }, [fetchSubmissions]);


    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('https://service-request-app-production.up.railway.app/api/admin/login', { username, password });

            if (response.status === 200) {
                localStorage.setItem('token', response.data.token);
                setIsLoggedIn(true);
                fetchSubmissions(response.data.token);
                showStatus('Login successful!', 'success');
            } else {
                // If status is not 200 but no error thrown (e.g., 401 handled by server logic)
                showStatus('Invalid credentials. Please try again.', 'warning');
            }
        } catch (error) {
            console.error('Login error:', error);
            showStatus('Login failed due to a server error.', 'danger');
        }
    };

    const handleResendMail = async (submissionId) => {
        const token = localStorage.getItem('token');
        if (!token) {
             showStatus('You must be logged in to perform this action.', 'warning');
             return;
        }

        try {
            const response = await axios.post(
                `https://service-request-app-production.up.railway.app/api/forms/${submissionId}/resend`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.status === 200) {
                showStatus('Email resent successfully!', 'success');
            } else {
                showStatus('Failed to resend email.', 'warning');
            }
        } catch (error) {
            console.error('Resend email error:', error);
            showStatus('Failed to resend email due to a network or server error.', 'danger');
        }
    };

    // Render Login Form if not logged in
    if (!isLoggedIn) {
        return (
            <div className="container d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
                <div className="card shadow-lg rounded-3" style={{ width: '100%', maxWidth: '400px' }}>
                    <div className="card-body p-4">
                        <h3 className="card-title text-center mb-4">Admin Login</h3>
                        <form onSubmit={handleLogin}>
                            <div className="mb-3">
                                <label htmlFor="username" className="form-label">Username</label>
                                <input type="text" className="form-control" id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="password" className="form-label">Password</label>
                                <input type="password" className="form-control" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <div className="d-grid">
                                <button type="submit" className="btn btn-primary rounded-pill">Log In</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // Render Admin Dashboard if logged in
    return (
        <div className="container my-5">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="card-title mb-0 text-primary">Form Submissions</h3>
                <button className="btn btn-danger rounded-pill px-4" onClick={handleLogout}>Log Out</button>
            </div>
            <div className="card shadow-lg rounded-3">
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-striped table-hover mb-0">
                            <thead>
                                <tr>
                                    <th className="text-nowrap">Name</th>
                                    <th className="text-nowrap">Contact Number</th>
                                    <th className="text-nowrap">Service</th>
                                    <th className="text-nowrap">Description</th>
                                    <th className="text-nowrap">Date Submitted</th>
                                    <th className="text-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((submission) => (
                                    <tr key={submission.id}>
                                        <td className="text-nowrap">{submission.fullName}</td>
                                        <td className="text-nowrap">{submission.contactNumber}</td>
                                        <td className="text-nowrap">{submission.serviceType}</td>
                                        <td>
                                            {/* Allow long descriptions to be scrollable but contained */}
                                            <div style={{ maxHeight: '60px', overflowY: 'auto', maxWidth: '300px' }}>
                                                {submission.projectDescription}
                                            </div>
                                        </td>
                                        <td className="text-nowrap">{submission.createdAt}</td>
                                        <td className="text-nowrap">
                                            <button 
                                                className="btn btn-sm btn-info text-white rounded-pill" 
                                                onClick={() => handleResendMail(submission.id)}
                                            >
                                                Resend Mail
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            {submissions.length === 0 && (
                <p className="text-center mt-4 text-muted">No submissions found or failed to load data.</p>
            )}
        </div>
    );
};

// Main App Component with Routes
function App() {
    const [modal, setModal] = useState({ message: '', type: '' });

    // Function to show the status message
    const showStatus = (message, type) => {
        setModal({ message, type });
        // Auto-hide after 5 seconds
        setTimeout(() => setModal({ message: '', type: '' }), 5000);
    };

    return (
        <BrowserRouter>
            <StatusMessage
                message={modal.message}
                type={modal.type}
                onClose={() => setModal({ message: '', type: '' })}
            />
            {/* Navigation Bar with Mobile Toggler */}
            <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm sticky-top">
                <div className="container-fluid">
                    <Link className="navbar-brand text-primary fw-bold" to="/">ServiceHub</Link>

                    {/* This button is CRITICAL for mobile responsiveness */}
                    <button 
                        className="navbar-toggler" 
                        type="button" 
                        data-bs-toggle="collapse" 
                        data-bs-target="#navbarNav" 
                        aria-controls="navbarNav" 
                        aria-expanded="false" 
                        aria-label="Toggle navigation"
                    >
                        <span className="navbar-toggler-icon"></span>
                    </button>

                    <div className="collapse navbar-collapse" id="navbarNav">
                        <ul className="navbar-nav ms-auto">
                            <li className="nav-item">
                                <Link className="nav-link" to="/">Home</Link>
                            </li>
                            <li className="nav-item">
                                <Link className="nav-link" to="/admin">Admin</Link>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>

            {/* Routes */}
            <Routes>
                {/* Pass showStatus down to components for non-alert messaging */}
                <Route path="/" element={<HomePage showStatus={showStatus} />} />
                <Route path="/admin" element={<AdminPage showStatus={showStatus} />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
