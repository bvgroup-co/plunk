// Environment configuration
// In development: Uses NEXT_PUBLIC_* env vars from .env file
// In production (Docker): Build-time values are replaced at container startup via sed

export const API_URI = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:8080';
export const DASHBOARD_URI = process.env.NEXT_PUBLIC_DASHBOARD_URI || 'http://localhost:3000';
