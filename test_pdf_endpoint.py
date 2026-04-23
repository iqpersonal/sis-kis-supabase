import requests, json, sys, os

BASE = "http://localhost:3001"

# Get auth token - login first
login = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@kis.edu.sa", "password": "admin123"}, timeout=10)
print("Login status:", login.status_code)

# Try without auth first (some endpoints allow it)
resp = requests.post(
    f"{BASE}/api/pdf-reports",
    headers={"Content-Type": "application/json"},
    json={
        "type": "student_progress_detail",
        "studentNumber": "0021-001712",
        "year": "25-26"
    },
    timeout=60
)
print(f"Status: {resp.status_code}")
print(f"Content-Type: {resp.headers.get('Content-Type', '')}")
print(f"Size: {len(resp.content)} bytes")
if resp.status_code != 200:
    print("Error body:", resp.text[:500])
else:
    # Save the PDF
    outfile = "test_progress_detail.pdf"
    with open(outfile, "wb") as f:
        f.write(resp.content)
    print(f"PDF saved to {outfile}")
