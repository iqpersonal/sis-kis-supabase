"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Upload, CheckCircle, Loader2, Image as ImageIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SchoolConfig {
  label: string;
  principal: string;
  principal_ar: string;
  academic_director: string;
  academic_director_ar: string;
}

interface TranscriptSettings {
  schools: Record<string, SchoolConfig>;
  school_logo: string; // base64 data URL
  cognia_logo: string; // base64 data URL
  moe_logo: string; // base64 data URL
  lwis_logo: string; // base64 data URL
  ib_logo: string; // base64 data URL
  updated_at?: string;
}

const DEFAULT_SETTINGS: TranscriptSettings = {
  schools: {
    "0021-01": {
      label: "Boys' School",
      principal: "",
      principal_ar: "",
      academic_director: "",
      academic_director_ar: "",
    },
    "0021-02": {
      label: "Girls' School",
      principal: "",
      principal_ar: "",
      academic_director: "",
      academic_director_ar: "",
    },
  },
  school_logo: "",
  cognia_logo: "",
  moe_logo: "",
  lwis_logo: "",
  ib_logo: "",
};

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */
export default function TranscriptSettingsPage() {
  const [settings, setSettings] = useState<TranscriptSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/transcript-settings");
        const json = await res.json();
        if (json.data) {
          setSettings((prev) => ({
            ...prev,
            ...json.data,
            schools: { ...prev.schools, ...(json.data.schools || {}) },
          }));
        }
      } catch {
        console.error("Failed to load transcript settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Save settings
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/transcript-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  // Remove background from an image using canvas
  const removeBackground = useCallback((dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(dataUrl); return; }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Sample corner pixels to determine background color
        const corners = [
          0, // top-left
          (canvas.width - 1) * 4, // top-right
          (canvas.height - 1) * canvas.width * 4, // bottom-left
          ((canvas.height - 1) * canvas.width + (canvas.width - 1)) * 4, // bottom-right
        ];
        let bgR = 0, bgG = 0, bgB = 0, count = 0;
        for (const idx of corners) {
          if (idx >= 0 && idx + 2 < data.length) {
            bgR += data[idx];
            bgG += data[idx + 1];
            bgB += data[idx + 2];
            count++;
          }
        }
        bgR = Math.round(bgR / count);
        bgG = Math.round(bgG / count);
        bgB = Math.round(bgB / count);

        // Tolerance for color matching (higher = more aggressive removal)
        const tolerance = 50;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const dist = Math.sqrt(
            (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2
          );
          if (dist < tolerance) {
            // Make background pixel fully transparent
            data[i + 3] = 0;
          } else if (dist < tolerance * 1.5) {
            // Soft edge: partial transparency for smoother edges
            const alpha = Math.round(((dist - tolerance) / (tolerance * 0.5)) * 255);
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }, []);

  // Handle image upload (convert to base64 + remove background)
  const handleImageUpload = useCallback(
    (field: "school_logo" | "cognia_logo" | "moe_logo" | "lwis_logo" | "ib_logo") => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        // Limit to 500KB
        if (file.size > 500 * 1024) {
          alert("Image must be under 500KB. Please compress or resize it first.");
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          const rawDataUrl = reader.result as string;
          // Auto-remove background
          const processed = await removeBackground(rawDataUrl);
          setSettings((prev) => ({
            ...prev,
            [field]: processed,
          }));
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
    [removeBackground]
  );

  // Update a school field
  const updateSchool = useCallback(
    (code: string, field: keyof SchoolConfig, value: string) => {
      setSettings((prev) => ({
        ...prev,
        schools: {
          ...prev.schools,
          [code]: {
            ...prev.schools[code],
            [field]: value,
          },
        },
      }));
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transcript Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure school officials and logos for the printed transcript / report card.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>

      <Separator />

      {/* ── School Officials ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(settings.schools).map(([code, school]) => (
          <Card key={code} className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">{school.label}</h2>
            <p className="text-xs text-muted-foreground">Major Code: {code}</p>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">School Principal (English)</label>
                <Input
                  value={school.principal}
                  onChange={(e) => updateSchool(code, "principal", e.target.value)}
                  placeholder="e.g. Laila Al Sadan"
                />
              </div>
              <div>
                <label className="text-sm font-medium">School Principal (Arabic)</label>
                <Input
                  dir="rtl"
                  value={school.principal_ar}
                  onChange={(e) => updateSchool(code, "principal_ar", e.target.value)}
                  placeholder="مديرة المدرسة"
                />
              </div>

              <Separator />

              <div>
                <label className="text-sm font-medium">Academic Director (English)</label>
                <Input
                  value={school.academic_director}
                  onChange={(e) => updateSchool(code, "academic_director", e.target.value)}
                  placeholder="e.g. Johanne Mohanna"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Academic Director (Arabic)</label>
                <Input
                  dir="rtl"
                  value={school.academic_director_ar}
                  onChange={(e) => updateSchool(code, "academic_director_ar", e.target.value)}
                  placeholder="المدير الأكاديمي"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Separator />

      {/* ── Logos ── */}
      <h2 className="text-lg font-semibold">Logos</h2>
      <p className="text-sm text-muted-foreground">
        Upload PNG/JPG images (max 500KB each). These appear on the printed transcript header and footer.
      </p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* School Logo */}
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">School Logo (Header)</h3>
          <div className="flex items-center gap-4">
            {settings.school_logo ? (
              <img
                src={settings.school_logo}
                alt="School Logo"
                className="h-20 w-20 object-contain border rounded"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImageUpload("school_logo")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {settings.school_logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, school_logo: "" }))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Cognia Logo */}
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">Cognia Logo (Footer)</h3>
          <div className="flex items-center gap-4">
            {settings.cognia_logo ? (
              <img
                src={settings.cognia_logo}
                alt="Cognia Logo"
                className="h-20 w-20 object-contain border rounded"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImageUpload("cognia_logo")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {settings.cognia_logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, cognia_logo: "" }))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Ministry of Education Logo */}
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">Ministry of Education (Footer)</h3>
          <div className="flex items-center gap-4">
            {settings.moe_logo ? (
              <img
                src={settings.moe_logo}
                alt="Ministry of Education Logo"
                className="h-20 w-20 object-contain border rounded"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImageUpload("moe_logo")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {settings.moe_logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, moe_logo: "" }))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* LWIS Network Logo */}
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">LWIS Network (Footer)</h3>
          <div className="flex items-center gap-4">
            {settings.lwis_logo ? (
              <img
                src={settings.lwis_logo}
                alt="LWIS Network Logo"
                className="h-20 w-20 object-contain border rounded"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImageUpload("lwis_logo")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {settings.lwis_logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, lwis_logo: "" }))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* IB Logo */}
        <Card className="p-6 space-y-4">
          <h3 className="font-medium">IB Logo (Footer)</h3>
          <div className="flex items-center gap-4">
            {settings.ib_logo ? (
              <img
                src={settings.ib_logo}
                alt="IB Logo"
                className="h-20 w-20 object-contain border rounded"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImageUpload("ib_logo")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {settings.ib_logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, ib_logo: "" }))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {settings.updated_at && (
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date(settings.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
