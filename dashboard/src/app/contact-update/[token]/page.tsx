"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ContactUpdateRedirect() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  useEffect(() => {
    router.replace(`/update-contact/${token}`);
  }, [router, token]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Redirecting...</p>
    </div>
  );
}
