"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { User, Calendar, Globe, BookOpen, School } from "lucide-react";
import type { StudentDetail } from "@/hooks/use-sis-data";

interface StudentDetailDialogProps {
  studentName: string;
  studentNumber: string;
  className: string;
  detail: StudentDetail;
  /** Extra stats shown in the header area */
  stats?: { label: string; value: string | number }[];
  children: React.ReactNode;
}

export function StudentDetailDialog({
  studentName,
  studentNumber,
  className: cls,
  detail,
  stats,
  children,
}: StudentDetailDialogProps) {
  const [open, setOpen] = useState(false);

  const infoItems = [
    { icon: User, label: "Gender", value: detail.gender || "—" },
    { icon: Calendar, label: "Date of Birth", value: detail.dob || "—" },
    { icon: Globe, label: "Nationality", value: detail.nationality || "—" },
    { icon: School, label: "Section", value: detail.section || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5" />
            {studentName}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{cls}</Badge>
            <span className="font-mono text-xs">{studentNumber}</span>
          </div>
        </DialogHeader>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-3">
          {infoItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-lg border p-3"
            >
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-medium truncate">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Extra stats if provided */}
        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg bg-muted/50 p-3 text-center"
              >
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Subject Grades */}
        {detail.subjects && detail.subjects.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold mb-2">
              <BookOpen className="h-4 w-4" />
              Subject Grades
            </h4>
            <div className="max-h-60 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right w-20">Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.subjects.map((s) => (
                    <TableRow key={s.subject}>
                      <TableCell className="text-sm">{s.subject}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-semibold ${
                            s.grade >= 90
                              ? "text-green-600"
                              : s.grade >= 70
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {s.grade}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
