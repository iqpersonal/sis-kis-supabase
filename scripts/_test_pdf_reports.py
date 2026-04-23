"""
Test script for PDF Reports API endpoint.
Gets a Firebase ID token using service account, then calls each report type.
"""

import json
import time
import requests
import base64
import struct
import hashlib
import hmac
import os

# ── Config ────────────────────────────────────────────────────────────────
BASE_URL = "http://localhost:3001"
SA_PATH = r"C:\Users\Admin\Desktop\Project\SiS\dashboard\serviceAccountKey.json"
FIREBASE_API_KEY = "AIzaSyC_5zqKY90TF9Qd9YlztnUCV09toCCHuog"

# ── Get ID token via service account custom token ─────────────────────────
def get_id_token():
    """
    1. Create a signed JWT (custom token) using the service account
    2. Exchange it for an ID token via Firebase REST API
    """
    with open(SA_PATH) as f:
        sa = json.load(f)

    # Build JWT header + payload
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg":"RS256","typ":"JWT"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(json.dumps({
        "iss": sa["client_email"],
        "sub": sa["client_email"],
        "aud": "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
        "iat": now,
        "exp": now + 3600,
        "uid": "test-script-admin",
        "claims": {"role": "super_admin"},
    }).encode()).rstrip(b"=")

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    private_key = serialization.load_pem_private_key(
        sa["private_key"].encode(), password=None
    )
    signing_input = header + b"." + payload
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=")
    custom_token = (signing_input + b"." + sig_b64).decode()

    # Exchange for ID token
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={FIREBASE_API_KEY}",
        json={"token": custom_token, "returnSecureToken": True},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


# ── Test helpers ──────────────────────────────────────────────────────────
def test_class_report(token: str, year="25-26", class_code="", school="all"):
    print(f"\n── Class Report (year={year}, class={class_code or 'all'}) ──")
    resp = requests.post(
        f"{BASE_URL}/api/pdf-reports",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "class_report", "year": year, "classCode": class_code, "school": school},
        timeout=30,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        ct = resp.headers.get("Content-Type", "")
        size = len(resp.content)
        print(f"  Content-Type: {ct}")
        print(f"  Size: {size:,} bytes")
        path = rf"C:\Users\Admin\Desktop\Project\SiS\scripts\test_class_report.pdf"
        with open(path, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {path}")
    else:
        try:
            print(f"  Error: {resp.json()}")
        except Exception:
            print(f"  Body: {resp.text[:300]}")


def test_transcript(token: str, student_number: str, year="25-26"):
    print(f"\n── Transcript ({student_number}) ──")
    resp = requests.post(
        f"{BASE_URL}/api/pdf-reports",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "transcript", "studentNumber": student_number, "years": [year]},
        timeout=30,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        size = len(resp.content)
        print(f"  Size: {size:,} bytes")
        path = rf"C:\Users\Admin\Desktop\Project\SiS\scripts\test_transcript_{student_number}.pdf"
        with open(path, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {path}")
    else:
        try:
            print(f"  Error: {resp.json()}")
        except Exception:
            print(f"  Body: {resp.text[:300]}")


def test_report_card(token: str, student_number: str, year="25-26"):
    print(f"\n── Report Card ({student_number}) ──")
    resp = requests.post(
        f"{BASE_URL}/api/pdf-reports",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "report_card", "studentNumber": student_number, "year": year},
        timeout=30,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        size = len(resp.content)
        print(f"  Size: {size:,} bytes")
        path = rf"C:\Users\Admin\Desktop\Project\SiS\scripts\test_report_card_{student_number}.pdf"
        with open(path, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {path}")
    else:
        try:
            print(f"  Error: {resp.json()}")
        except Exception:
            print(f"  Body: {resp.text[:300]}")


# ── Also check bulk-export to find a real student number ─────────────────
def get_sample_student(token: str, year="25-26") -> str | None:
    print("\n── Fetching sample student from bulk-export ──")
    resp = requests.get(
        f"{BASE_URL}/api/bulk-export?year={year}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code == 200:
        students = resp.json().get("students", [])
        if students:
            s = students[0]
            print(f"  First student: {s['student_number']} — {s['student_name']}")
            return s["student_number"]
        print("  No students found")
    else:
        print(f"  bulk-export failed: {resp.status_code}")
    return None


# ── Main ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Getting Firebase ID token...")
    try:
        token = get_id_token()
        print(f"  Token obtained (length={len(token)})")
    except Exception as e:
        print(f"  FAILED to get token: {e}")
        raise SystemExit(1)

    student = get_sample_student(token)

    # Test class report (doesn't need a specific student)
    test_class_report(token, year="25-26", class_code="", school="all")

    if student:
        test_transcript(token, student)
        test_report_card(token, student)

    # Test student progress detail with the known student
    print("\n── Student Progress Detail (0021-001712) ──")
    resp = requests.post(
        f"{BASE_URL}/api/pdf-reports",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "student_progress_detail", "studentNumber": "0021-001712", "year": "25-26"},
        timeout=60,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        size = len(resp.content)
        print(f"  Size: {size:,} bytes")
        path = r"C:\Users\Admin\Desktop\Project\SiS\scripts\test_progress_detail.pdf"
        with open(path, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {path}")
    else:
        try:
            print(f"  Error: {resp.json()}")
        except Exception:
            print(f"  Body: {resp.text[:500]}")

    print("\nDone.")
