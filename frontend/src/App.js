import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios';


// Home Page Component
const HomePage = () => {
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
            const response = await axios.post('service-request-app-production.up.railway.app/api/form', {
                fullName: formData.fullName,
                contactNumber: formData.contactNumber,
                serviceType: formData.serviceType,
                projectDescription: formData.projectDescription,
            });

            if (response.status === 200) {
                alert('Form submitted successfully!');
                setFormData({
                    fullName: '',
                    contactNumber: '',
                    serviceType: '',
                    projectDescription: '',
                });
            } else {
                alert('Error submitting form.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error submitting form.');
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
                    <div className="card shadow-sm border-0">
                        <div className="card-body p-4 p-md-5">
                            <h2 className="card-title text-center mb-4">Service Request Form</h2>
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
                                    <button type="submit" className="btn btn-primary btn-lg">
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
// Admin Dashboard Component
const AdminPage = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submissions, setSubmissions] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            setIsLoggedIn(true);
            fetchSubmissions(token);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('service-request-app-production.up.railway.app/api/admin/login', { username, password });

            if (response.status === 200) {
                localStorage.setItem('token', response.data.token);
                setIsLoggedIn(true);
                fetchSubmissions(response.data.token);
            } else {
                alert('Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        navigate('/admin');
    };

   const fetchSubmissions = useCallback(async (token) => {
        try {
            const response = await axios.get('service-request-app-production.up.railway.app/api/forms', {
                headers: { 'Authorization': `Bearer ${token}` },
             });

            if (response.status === 200) {
                const formattedSubmissions = response.data.map(item => ({
                    id: item.Id,
                    fullName: item.name,
                    contactNumber: item.contact_number,
                    serviceType: item.service,
                    projectDescription: item.description,
                    createdAt: item.created_at,
                }));
                console.log('Formatted submissions:', formattedSubmissions);
                setSubmissions(formattedSubmissions);
            } else {
                alert('Failed to fetch submissions. Please log in again.');
                handleLogout();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            alert('Failed to fetch submissions.');
            handleLogout();
        }
    }, [handleLogout, setSubmissions]);

    const handleResendMail = async (submissionId) => {
        const token = localStorage.getItem('token');
        try {
            const response = await axios.post(
                `service-request-app-production.up.railway.app/api/forms/${submissionId}/resend`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.status === 200) {
                alert('Email resent successfully!');
            } else {
                alert('Failed to resend email.');
            }
        } catch (error) {
            console.error('Resend email error:', error);
            alert('Failed to resend email.');
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="container d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
                <div className="card shadow" style={{ width: '100%', maxWidth: '400px' }}>
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
                                <button type="submit" className="btn btn-primary">Log In</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container my-5">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="card-title mb-0">Form Submissions</h3>
                <button className="btn btn-danger" onClick={handleLogout}>Log Out</button>
            </div>
            <div className="card shadow">
                <div className="card-body">
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Contact Number</th>
                                    <th>Service</th>
                                    <th>Description</th>
                                    <th>Date Submitted</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((submission) => (
                                    <tr key={submission.id}>
                                        <td>{submission.fullName}</td>
                                        <td>{submission.contactNumber}</td>
                                        <td>{submission.serviceType}</td>
                                        <td>{submission.projectDescription}</td>
                                        <td>{new Date(submission.createdAt).toLocaleString()}</td>
                                        <td>
                                            <button className="btn btn-sm btn-info" onClick={() => handleResendMail(submission.id)}>
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
        </div>
    );
};

// Main App Component with Routes
function App() {
    return (
        <BrowserRouter>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm">
                <div className="container-fluid">
                    <Link className="navbar-brand" to="/">ServiceHub</Link>
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
                <Route path="/" element={<HomePage />} />
                <Route path="/admin" element={<AdminPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
