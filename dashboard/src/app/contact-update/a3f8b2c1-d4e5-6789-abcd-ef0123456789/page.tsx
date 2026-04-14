export default function ContactUpdateSample() {
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 12, background: '#fafaff' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Contact Update Link — Sample</h1>
      <p style={{ fontSize: 18, marginBottom: 24 }}>
        This is a <b>sample page</b> for the contact update link:<br />
        <span style={{ color: '#6c63ff', wordBreak: 'break-all' }}>
          https://sis-kis.web.app/contact-update/a3f8b2c1-d4e5-6789-abcd-ef0123456789
        </span>
      </p>
      <p style={{ fontSize: 16, marginBottom: 16 }}>
        In production, this page will show the contact update form for the parent.<br />
        The token <b>a3f8b2c1-d4e5-6789-abcd-ef0123456789</b> is auto-generated and unique per family.
      </p>
      <p style={{ fontSize: 15, color: '#888' }}>
        If you see this page, your deployment and template URL are working!
      </p>
    </div>
  );
}
