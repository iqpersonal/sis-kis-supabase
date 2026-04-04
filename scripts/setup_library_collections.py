"""
Setup library collections in Firestore for the SiS Library Module.

Creates:
  - library_books     : Book catalog (simplified from raw_Lib_Resources + MARC data)
  - library_copies    : Physical copies on shelves (barcode, status, location)
  - library_borrowings: Borrow/return transaction log per student

Run once to bootstrap. The dashboard UI handles ongoing CRUD.
"""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
app = firebase_admin.initialize_app(cred)
db = firestore.client()


def seed_sample_books():
    """Seed a few sample books so the UI has data to show."""
    books = [
        {
            "title": "The Alchemist",
            "title_ar": "الخيميائي",
            "author": "Paulo Coelho",
            "isbn": "978-0062315007",
            "category": "Fiction",
            "language": "English",
            "publication_year": 2014,
            "publisher": "HarperOne",
            "total_copies": 3,
            "available_copies": 2,
            "cover_url": "",
            "created_at": firestore.SERVER_TIMESTAMP,
        },
        {
            "title": "A Brief History of Time",
            "title_ar": "موجز تاريخ الزمن",
            "author": "Stephen Hawking",
            "isbn": "978-0553380163",
            "category": "Science",
            "language": "English",
            "publication_year": 1998,
            "publisher": "Bantam",
            "total_copies": 2,
            "available_copies": 2,
            "cover_url": "",
            "created_at": firestore.SERVER_TIMESTAMP,
        },
        {
            "title": "قصص الأنبياء",
            "title_ar": "قصص الأنبياء",
            "author": "ابن كثير",
            "isbn": "978-9953181516",
            "category": "Islamic Studies",
            "language": "Arabic",
            "publication_year": 2010,
            "publisher": "دار ابن كثير",
            "total_copies": 5,
            "available_copies": 4,
            "cover_url": "",
            "created_at": firestore.SERVER_TIMESTAMP,
        },
        {
            "title": "Charlotte's Web",
            "title_ar": "شبكة شارلوت",
            "author": "E.B. White",
            "isbn": "978-0064400558",
            "category": "Children",
            "language": "English",
            "publication_year": 2012,
            "publisher": "HarperCollins",
            "total_copies": 4,
            "available_copies": 3,
            "cover_url": "",
            "created_at": firestore.SERVER_TIMESTAMP,
        },
        {
            "title": "The Little Prince",
            "title_ar": "الأمير الصغير",
            "author": "Antoine de Saint-Exupéry",
            "isbn": "978-0156012195",
            "category": "Children",
            "language": "English",
            "publication_year": 2000,
            "publisher": "Mariner Books",
            "total_copies": 3,
            "available_copies": 1,
            "cover_url": "",
            "created_at": firestore.SERVER_TIMESTAMP,
        },
    ]

    print("Seeding library_books...")
    for b in books:
        ref = db.collection("library_books").document()
        ref.set(b)
        book_id = ref.id
        print(f"  Created book: {b['title']} (ID: {book_id})")

        # Create physical copies for each book
        for i in range(1, b["total_copies"] + 1):
            status = "available"
            if i > b["available_copies"]:
                status = "borrowed"
            copy_ref = db.collection("library_copies").document()
            copy_ref.set({
                "book_id": book_id,
                "barcode": f"KIS-{book_id[:6].upper()}-{i:03d}",
                "status": status,  # available | borrowed | lost | damaged
                "location": "Main Library",
                "condition": "good",
                "created_at": firestore.SERVER_TIMESTAMP,
            })
        print(f"    Created {b['total_copies']} copies")

    print("\nDone! Sample books and copies created.")


def seed_sample_borrowings():
    """Create a few sample borrowings (requires real student numbers)."""
    # Get a few student numbers from the students collection
    students_snap = db.collection("students").limit(3).get()
    if not students_snap:
        print("No students found - skipping sample borrowings")
        return

    books_snap = db.collection("library_books").limit(3).get()
    if not books_snap:
        print("No books found - run seed_sample_books first")
        return

    from datetime import datetime, timedelta

    print("\nSeeding sample borrowings...")
    for i, (student_doc, book_doc) in enumerate(zip(students_snap, books_snap)):
        s_data = student_doc.to_dict()
        b_data = book_doc.to_dict()
        student_number = s_data.get("Student_Number", student_doc.id)
        student_name = s_data.get("E_Full_Name", s_data.get("A_Student_Name", "Unknown"))

        borrow_date = datetime.now() - timedelta(days=10 - i * 3)
        due_date = borrow_date + timedelta(days=14)

        status = "borrowed" if i < 2 else "returned"
        return_date = None if status == "borrowed" else (due_date - timedelta(days=2)).isoformat()

        ref = db.collection("library_borrowings").document()
        ref.set({
            "student_number": str(student_number),
            "student_name": str(student_name),
            "book_id": book_doc.id,
            "book_title": b_data.get("title", ""),
            "book_title_ar": b_data.get("title_ar", ""),
            "author": b_data.get("author", ""),
            "borrow_date": borrow_date.isoformat(),
            "due_date": due_date.isoformat(),
            "return_date": return_date,
            "status": status,  # borrowed | returned | overdue
            "notes": "",
            "checked_out_by": "system",
            "created_at": firestore.SERVER_TIMESTAMP,
        })
        print(f"  {student_name} borrowed '{b_data.get('title')}' - {status}")

    print("\nDone! Sample borrowings created.")


if __name__ == "__main__":
    seed_sample_books()
    seed_sample_borrowings()
    firebase_admin.delete_app(app)
