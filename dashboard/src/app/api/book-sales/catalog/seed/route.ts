import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { invalidateCache } from "@/lib/cache";
import { verifySuperAdmin } from "@/lib/api-auth";

/**
 * Book Catalog Seed API — one-time data load for 25-26 catalog
 *
 * POST /api/book-sales/catalog/seed
 *   { "confirm": true }
 *
 * Seeds all KG1–Grade 12 books into Firestore book_catalog collection.
 */

const YEAR = "25-26";

// ── Compact format: [grade, isbn, title, price] ─────────────
const DATA: [string, string, string, number][] = [
  // ═══════════════════ KG1 ═══════════════════
  ["KG1", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["KG1", "", "USE OF COMPUTERS, PROJECTORS & SMART BOARDS", 150],
  ["KG1", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],

  // ═══════════════════ KG2 ═══════════════════
  ["KG2", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["KG2", "", "USE OF COMPUTERS, PROJECTORS & SMART BOARDS", 150],
  ["KG2", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],

  // ═══════════════════ KG3 ═══════════════════
  ["KG3", "", "HMH ONLINE PROGRAMS (Into Reading / Into Math / Science Dimensions Digital License K)", 325],
  ["KG3", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["KG3", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["KG3", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["KG3", "9780358449256", "Into Reading Student myBook Softcover Grade K", 150],
  ["KG3", "9781328460547", "INTO RDG KNO IT SHW IT GK", 105],
  ["KG3", "9780358153689", "Into Math Student Edition Collection Grade K", 155],
  ["KG3", "9780358105763", "Into Math Practice and Homework Journal", 55],
  ["KG3", "9780544713239", "Science Dimension Student Edition [consumable] K", 80],

  // ═══════════════════ GRADE 1 ═══════════════════
  ["Grade 1", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math K-5 / Science Dimensions K-5 Digital License)", 450],
  ["Grade 1", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 1", "", "Online Chinese books", 75],
  ["Grade 1", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 1", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 1", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 1", "", "Chinese books (1a Textbooks and 1a Workbooks)", 131],
  ["Grade 1", "", "Chinese books (1b Textbooks and 1b Workbooks)", 131],
  ["Grade 1", "9780358461449", "Into Reading Student myBook Softcover Volume 1 Grade 1", 60],
  ["Grade 1", "9780358461456", "Into Reading Student myBook Softcover Volume 2 Grade 1", 60],
  ["Grade 1", "9780358461463", "Into Reading Student myBook Softcover Volume 3 Grade 1", 60],
  ["Grade 1", "9780358461470", "Into Reading Student myBook Softcover Volume 4 Grade 1", 60],
  ["Grade 1", "9780358461487", "Into Reading Student myBook Softcover Volume 5 Grade 1", 60],
  ["Grade 1", "9780358192060", "INTO RDG KNO IT SHW IT G1", 110],
  ["Grade 1", "9780358153696", "Into Math Student Edition Collection G1", 165],
  ["Grade 1", "9780358110996", "Into Math Practice and Homework Journal", 55],
  ["Grade 1", "9780544713246", "Science Dimension Student Edition [consumable] G1", 145],

  // ═══════════════════ GRADE 2 ═══════════════════
  ["Grade 2", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math K-5 / Science Dimensions K-5 Digital License)", 450],
  ["Grade 2", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 2", "", "Online Chinese books", 75],
  ["Grade 2", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 2", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 2", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 2", "", "Chinese books (2a Textbook and 2a Workbook)", 131],
  ["Grade 2", "9780358461500", "Into Reading Student myBook Softcover Volume 1 Grade 2", 75],
  ["Grade 2", "9780358461517", "Into Reading Student myBook Softcover Volume 2 Grade 2", 75],
  ["Grade 2", "9780358461524", "Into Reading Student myBook Softcover Volume 3 Grade 2", 75],
  ["Grade 2", "9780358192077", "INTO RDG KNO IT SHW IT G2", 110],
  ["Grade 2", "9780358153702", "Into Math Student Edition Collection G2", 165],
  ["Grade 2", "9780358111009", "Into Math Practice and Homework Journal", 55],
  ["Grade 2", "9780544713253", "Science Dimension Student Edition [consumable] G2", 145],

  // ═══════════════════ GRADE 3 ═══════════════════
  ["Grade 3", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math K-5 / Science Dimensions K-5 Digital License)", 450],
  ["Grade 3", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 3", "", "Online Chinese books", 75],
  ["Grade 3", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 3", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 3", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 3", "", "Chinese books (2b Textbook and 2b Workbook)", 131],
  ["Grade 3", "9780358461531", "Into Reading Student myBook Softcover Volume 1 Grade 3", 140],
  ["Grade 3", "9780358461548", "Into Reading Student myBook Softcover Volume 2 Grade 3", 140],
  ["Grade 3", "9780358192084", "INTO RDG KNO IT SHW IT G3", 110],
  ["Grade 3", "9780358002260", "Into Math Gr 3 Vol 1 - U 1-3", 82.5],
  ["Grade 3", "9780358002277", "Into Math Gr 3 Vol 2 - U 4-6", 82.5],
  ["Grade 3", "9780358111016", "Into Math Practice and Homework Journal", 55],
  ["Grade 3", "9780544713260", "Science Dimension Student Edition [consumable] G3", 155],

  // ═══════════════════ GRADE 4 ═══════════════════
  ["Grade 4", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math K-5 / Science Dimensions K-5 Digital License)", 450],
  ["Grade 4", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 4", "", "Online Chinese books", 75],
  ["Grade 4", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 4", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 4", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 4", "", "Chinese books (3a Textbook and 3a Workbook)", 131],
  ["Grade 4", "9780358461555", "Into Reading Student myBook Softcover Volume 1 Grade 4", 140],
  ["Grade 4", "9780358461562", "Into Reading Student myBook Softcover Volume 2 Grade 4", 140],
  ["Grade 4", "9780358192091", "INTO RDG KNO IT SHW IT G4", 110],
  ["Grade 4", "9781328960177", "Into Math Gr 4 Vol 1 - U 1-3", 85],
  ["Grade 4", "9780358002284", "Into Math Gr 4 Vol 2 - U 4-7", 85],
  ["Grade 4", "9780358111023", "Into Math Practice and Homework Journal", 55],
  ["Grade 4", "9780544713277", "Science Dimension Student Edition [consumable] G4", 160],

  // ═══════════════════ GRADE 5 ═══════════════════
  ["Grade 5", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math K-5 / Science Dimensions K-5 Digital License)", 450],
  ["Grade 5", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 5", "", "Online Chinese books", 75],
  ["Grade 5", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 5", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 5", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 5", "", "Chinese books (3b Textbook and 3b Workbook)", 131],
  ["Grade 5", "9780358461579", "Into Reading Student myBook Softcover Volume 1 Grade 5", 140],
  ["Grade 5", "9780358461586", "Into Reading Student myBook Softcover Volume 2 Grade 5", 140],
  ["Grade 5", "9780358192107", "INTO RDG KNO IT SHW IT G5", 110],
  ["Grade 5", "9780358002291", "Into Math Gr 5 Vol 1 - U 1-3", 85],
  ["Grade 5", "9780358002307", "Into Math Gr 5 Vol 2 - U 4-8", 85],
  ["Grade 5", "9780358111566", "Into Math Practice and Homework Journal", 55],
  ["Grade 5", "9780544713284", "Science Dimension Student Edition [consumable] G5", 165],

  // ═══════════════════ GRADE 6 ═══════════════════
  ["Grade 6", "", "HMH ONLINE PROGRAMS (Into Reading K-6 / Into Math 6-8 / Science Dimensions 6-8 Digital License)", 450],
  ["Grade 6", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 6", "", "Online Chinese books", 75],
  ["Grade 6", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 6", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  ["Grade 6", "", "INTERNET ACCESS & EDUCATIONAL MOBILE APPS", 125],
  ["Grade 6", "", "Chinese books (4a Textbooks and 4a Workbooks)", 131],
  ["Grade 6", "", "Chinese books (4b Textbooks and 4b Workbooks)", 131],
  ["Grade 6", "9781328858771", "20 INTO RDG STU MYBK SC V1 G6", 140],
  ["Grade 6", "9781328517036", "20 INTO RDG STU MYBK SC V2 G6", 140],
  ["Grade 6", "9781328453389", "INTO RDG KNO IT SHW IT G6", 110],
  ["Grade 6", "9780358115816", "Into Math Student Edition G6", 175],
  ["Grade 6", "9780544860957", "Science Dimensions Module B (Grades 6-8) - Cells and Heredity", 105],
  ["Grade 6", "9780544860964", "Science Dimensions Module C (Grades 6-8) - Ecology and the Environment", 105],
  ["Grade 6", "9780544860988", "Science Dimensions Module E (Grades 6-8) - Earth's Water and Atmosphere", 105],
  ["Grade 6", "9780544861046", "Science Dimensions Module I (Grades 6-8) - Energy and Energy Transfer", 105],

  // ═══════════════════ GRADE 7 ═══════════════════
  // Digital items
  ["Grade 7", "9780358732563", "INTO LITERATURE SE ONLINE GRADE 7", 250],
  ["Grade 7", "9780358783527", "Science Dimensions Module A (Grades 6-8) - Engineering and Science / ONLINE", 80],
  ["Grade 7", "9780358783527", "Science Dimensions Module D (Grades 6-8) - The Diversity of Living Things / ONLINE", 80],
  ["Grade 7", "9780358783527", "Science Dimensions Module G (Grades 6-8) - Earth and Human Activity / ONLINE", 80],
  ["Grade 7", "9780358783527", "Science Dimensions Module J (Grades 6-8) - Chemistry / ONLINE", 80],
  ["Grade 7", "9780358733010", "Into Algebra 1 Student Digital License", 190],
  ["Grade 7", "9780358733034", "Into Geometry Student Digital License", 190],
  ["Grade 7", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 7", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 7", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 7", "9780358416401", "Into Literature Student Edition Softcover Grade 7", 290],
  ["Grade 7", "9780544861060", "Science Dimensions Module A (Grades 6-8) - Engineering and Science", 105],
  ["Grade 7", "9780544860971", "Science Dimensions Module D (Grades 6-8) - The Diversity of Living Things", 105],
  ["Grade 7", "9780544861008", "Science Dimensions Module G (Grades 6-8) - Earth and Human Activity", 105],
  ["Grade 7", "9780544861022", "Science Dimensions Module J (Grades 6-8) - Chemistry", 105],
  ["Grade 7", "9781328951816", "Into Algebra 1 - Student Edition", 445],
  ["Grade 7", "9780358055334", "Into AG1 JRNL PRAC WBK", 75],
  ["Grade 7", "9780358055280", "Into Geometry - Student Edition", 445],
  ["Grade 7", "9780358055341", "Into Geometry JRNL PRAC WBK", 75],

  // ═══════════════════ GRADE 8 ═══════════════════
  // Digital items
  ["Grade 8", "9780358732563", "INTO LITERATURE SE ONLINE GRADE 8", 250],
  ["Grade 8", "9780358783527", "Science Dimensions Module F (Grades 6-8) - Geologic Processes and History / ONLINE", 80],
  ["Grade 8", "9780358783527", "Science Dimensions Module H (Grades 6-8) - Space Science / ONLINE", 80],
  ["Grade 8", "9780358783527", "Science Dimensions Module K (Grades 6-8) - Forces, Motion, and Fields / ONLINE", 80],
  ["Grade 8", "9780358783527", "Science Dimensions Module L (Grades 6-8) - Waves and Their Applications / ONLINE", 80],
  ["Grade 8", "9780358733010", "Into Algebra 1 Student Digital License", 190],
  ["Grade 8", "9780358733034", "Into Geometry Student Digital License", 190],
  ["Grade 8", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 8", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 8", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 8", "9780358416418", "Into Literature Student Edition Softcover Grade 8", 290],
  ["Grade 8", "9780544860995", "Science Dimensions Module F (Grades 6-8) - Geologic Processes and History", 105],
  ["Grade 8", "9780544861015", "Science Dimensions Module H (Grades 6-8) - Space Science", 105],
  ["Grade 8", "9780544861039", "Science Dimensions Module K (Grades 6-8) - Forces, Motion, and Fields", 105],
  ["Grade 8", "9780544861053", "Science Dimensions Module L (Grades 6-8) - Waves and Their Applications", 105],
  ["Grade 8", "9781328951816", "Into Algebra 1 - Student Edition", 445],
  ["Grade 8", "9780358055334", "Into AG1 JRNL PRAC WBK", 75],
  ["Grade 8", "9780358055280", "Into Geometry - Student Edition", 445],
  ["Grade 8", "9780358055341", "Into Geometry JRNL PRAC WBK", 75],

  // ═══════════════════ GRADE 9 ═══════════════════
  // Digital items
  ["Grade 9", "9780358732570", "INTO LITERATURE SE ONLINE GRADE 9", 250],
  ["Grade 9", "9780358733096", "Into Algebra 2 Student Digital License", 190],
  ["Grade 9", "9780358783558", "BIOLOGY Science Dimensions Student Digital License", 190],
  ["Grade 9", "9780358783565", "PHYSICS Science Dimensions Student Digital License", 190],
  ["Grade 9", "9780358783572", "Chemistry Science Dimensions Student Digital License", 190],
  ["Grade 9", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 9", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 9", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 9", "9780358416425", "Into Literature Student Edition Softcover Grade 9", 290],
  ["Grade 9", "9780358055297", "INTO ALGEBRA 2 - Student Edition", 445],
  ["Grade 9", "9780358055358", "Into AG2 JRNL PRAC WBK", 75],
  ["Grade 9", "9780544861787", "BIOLOGY Science Dimensions Student Edition", 335],
  ["Grade 9", "9780544861794", "PHYSICS Science Dimensions Student Edition", 290],
  ["Grade 9", "9780544861800", "Chemistry Science Dimensions Student Edition", 290],

  // ═══════════════════ GRADE 10 ═══════════════════
  // Digital items
  ["Grade 10", "9780358732570", "INTO LITERATURE SE ONLINE GRADE 10", 250],
  ["Grade 10", "9780358733096", "Into Algebra 2 Student Digital License", 190],
  ["Grade 10", "9780358783558", "BIOLOGY Science Dimensions Student Digital License", 190],
  ["Grade 10", "9780358783565", "PHYSICS Science Dimensions Student Digital License", 190],
  ["Grade 10", "9780358783572", "Chemistry Science Dimensions Student Digital License", 190],
  ["Grade 10", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 10", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 10", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 10", "9780358416432", "Into Literature Student Edition Softcover Grade 10", 290],
  ["Grade 10", "9780358055297", "INTO ALGEBRA 2 - Student Edition", 445],
  ["Grade 10", "9780358055358", "Into AG2 JRNL PRAC WBK", 75],
  ["Grade 10", "9780544861787", "BIOLOGY Science Dimensions Student Edition", 335],
  ["Grade 10", "9780544861794", "PHYSICS Science Dimensions Student Edition", 290],
  ["Grade 10", "9780544861800", "Chemistry Science Dimensions Student Edition", 290],

  // ═══════════════════ GRADE 11 ═══════════════════
  // Digital items
  ["Grade 11", "9780358732570", "INTO LITERATURE SE ONLINE GRADE 11", 250],
  ["Grade 11", "9780358783558", "BIOLOGY Science Dimensions Student Digital License", 190],
  ["Grade 11", "9780358783565", "PHYSICS Science Dimensions Student Digital License", 190],
  ["Grade 11", "9780358783572", "Chemistry Science Dimensions Student Digital License", 190],
  ["Grade 11", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 11", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 11", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 11", "9780358416449", "Into Literature Student Edition Softcover Volume 1 Grade 11", 150],
  ["Grade 11", "9780358416456", "Into Literature Student Edition Softcover Volume 2 Grade 11", 150],
  ["Grade 11", "9780544861787", "BIOLOGY Science Dimensions Student Edition", 335],
  ["Grade 11", "9780544861794", "PHYSICS Science Dimensions Student Edition", 290],
  ["Grade 11", "9780544861800", "Chemistry Science Dimensions Student Edition", 290],

  // ═══════════════════ GRADE 12 ═══════════════════
  // Digital items
  ["Grade 12", "9780358732570", "INTO LITERATURE SE ONLINE GRADE 12", 250],
  ["Grade 12", "9780358783558", "BIOLOGY Science Dimensions Student Digital License", 190],
  ["Grade 12", "9780358783565", "PHYSICS Science Dimensions Student Digital License", 190],
  ["Grade 12", "9780358783572", "Chemistry Science Dimensions Student Digital License", 190],
  ["Grade 12", "", "Coding first + Robotics / Online + A.I (Artificial Intelligence)", 190],
  ["Grade 12", "", "USE OF MANIPULATIVES & EDUCATIONAL PROGRAM KITS", 150],
  ["Grade 12", "", "USE OF COMPUTERS, PROJECTORS, E-BEAMS, INTERNET", 150],
  // Physical books
  ["Grade 12", "9780358416463", "Into Literature Student Edition Softcover Volume 1 Grade 12", 150],
  ["Grade 12", "9780358416470", "Into Literature Student Edition Softcover Volume 2 Grade 12", 150],
  ["Grade 12", "9780544861787", "BIOLOGY Science Dimensions Student Edition", 335],
  ["Grade 12", "9780544861794", "PHYSICS Science Dimensions Student Edition", 290],
  ["Grade 12", "9780544861800", "Chemistry Science Dimensions Student Edition", 290],
];

// ── Auto-derive subject from title ───────────────────────────
function deriveSubject(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("hmh online") || t.includes("digital license") || t.includes("se online")) return "Digital Programs";
  if (t.includes("coding") || t.includes("robotics") || t.includes("a.i")) return "Technology";
  if (t.includes("manipulatives")) return "Educational Materials";
  if (t.includes("computers") || t.includes("projectors") || t.includes("e-beams")) return "Technology";
  if (t.includes("internet access")) return "Technology";
  if (t.includes("chinese")) return "Chinese";
  if (t.includes("reading") || t.includes("rdg") || t.includes("literature")) return "English";
  if (t.includes("math") || t.includes("algebra") || t.includes("geometry") || t.includes("ag1") || t.includes("ag2")) return "Math";
  if (t.includes("biology")) return "Biology";
  if (t.includes("physics")) return "Physics";
  if (t.includes("chemistry")) return "Chemistry";
  if (t.includes("science")) return "Science";
  return "";
}

// ── POST handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    if (body.confirm !== true) {
      return NextResponse.json({
        error: "Send { confirm: true } to seed the catalog",
        total_books: DATA.length,
        grades: [...new Set(DATA.map(d => d[0]))],
      }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const BATCH_SIZE = 500;
    let written = 0;

    for (let i = 0; i < DATA.length; i += BATCH_SIZE) {
      const chunk = DATA.slice(i, i + BATCH_SIZE);
      const rows = chunk.map(([grade, isbn, title, price]) => ({
        id: crypto.randomUUID(),
        title: title.trim(),
        grade,
        subject: deriveSubject(title),
        price,
        isbn: isbn.trim(),
        year: YEAR,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

      const { error } = await supabase.from("book_catalog").insert(rows);
      if (error) throw error;
      written += rows.length;
    }

    invalidateCache("book_catalog:");

    // Summary by grade
    const summary: Record<string, { count: number; total: number }> = {};
    for (const [grade, , , price] of DATA) {
      if (!summary[grade]) summary[grade] = { count: 0, total: 0 };
      summary[grade].count++;
      summary[grade].total += price;
    }

    return NextResponse.json({
      success: true,
      year: YEAR,
      total_books: written,
      by_grade: summary,
    });
  } catch (err) {
    console.error("Seed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
