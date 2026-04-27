"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface VerificationData {
  studentName: string;
  studentNumber: string;
  ceremonyDate: string;
}

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">(
    "loading"
  );
  const [data, setData] = useState<VerificationData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!code) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/diploma-verifications?id=${encodeURIComponent(code)}`);
        if (res.ok) {
          const json = await res.json();
          setData({
            studentName: json.student_name || "",
            studentNumber: json.student_number || "",
            ceremonyDate: json.ceremony_date || "",
          });
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch (err) {
        console.error("Verify error:", err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("invalid");
      }
    })();
  }, [code]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,.1)",
          padding: "48px 40px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* School header */}
        <img
          src="/kis-logo.png"
          alt="KIS"
          style={{ height: 72, width: "auto", margin: "0 auto 12px" }}
        />
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 4px",
          }}
        >
          Khaled International Schools
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 32px" }}>
          Diploma Verification
        </p>

        {status === "loading" && (
          <p style={{ color: "#64748b", fontSize: 16 }}>Verifying…</p>
        )}

        {status === "valid" && data && (
          <div>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 32,
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#16a34a",
                margin: "0 0 24px",
              }}
            >
              Verified Diploma
            </h2>
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 12,
                padding: "20px 24px",
                textAlign: "left",
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Student Name
                </span>
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#0f172a",
                    margin: "2px 0 0",
                  }}
                >
                  {data.studentName}
                </p>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Student Number
                </span>
                <p
                  style={{
                    fontSize: 16,
                    color: "#334155",
                    margin: "2px 0 0",
                  }}
                >
                  {data.studentNumber}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Ceremony Date
                </span>
                <p
                  style={{
                    fontSize: 16,
                    color: "#334155",
                    margin: "2px 0 0",
                  }}
                >
                  {data.ceremonyDate}
                </p>
              </div>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "#94a3b8",
                marginTop: 20,
              }}
            >
              This diploma was issued by Khaled International Schools, Riyadh.
            </p>
          </div>
        )}

        {status === "invalid" && (
          <div>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 32,
              }}
            >
              ✕
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#dc2626",
                margin: "0 0 12px",
              }}
            >
              Invalid Diploma
            </h2>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              This verification code is not recognized. The diploma may be
              counterfeit or the link may be incorrect.
            </p>
            {errorMsg && (
              <p style={{ color: "#94a3b8", fontSize: 11, marginTop: 12 }}>
                Debug: {errorMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
