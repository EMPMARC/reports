const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");
const PDFDocument = require("pdfkit");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));


const dbConfig = {
  host: "chwc-database.choewaaukon8.eu-west-2.rds.amazonaws.com",
  user: "admin",
  password: "CHWC2025Project",
  database: "chwc"
};


app.get("/report",function(req,res){
  res.sendFile(__dirname+"/index.html")
})


app.post("/report1", async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);

    
   const [rows] = await connection.execute(
  `SELECT 
      m.month,
      COALESCE(a.total_bookings, 0) AS total_bookings,
      COALESCE(p.total_emergencies, 0) AS total_emergencies
   FROM (
       SELECT DATE_FORMAT(appointment_date,'%M %Y') AS month
       FROM appointments
       WHERE appointment_date IS NOT NULL
       UNION
       SELECT DATE_FORMAT(date,'%M %Y') AS month
       FROM emergency_onboarding
       WHERE date IS NOT NULL
   ) m
   LEFT JOIN (
       SELECT DATE_FORMAT(appointment_date,'%M %Y') AS month,
              COUNT(*) AS total_bookings
       FROM appointments
       WHERE appointment_date IS NOT NULL
       GROUP BY DATE_FORMAT(appointment_date,'%M %Y')
   ) a ON m.month = a.month
   LEFT JOIN (
       SELECT DATE_FORMAT(date,'%M %Y') AS month,
              COUNT(*) AS total_emergencies
       FROM emergency_onboarding
       WHERE date IS NOT NULL
       GROUP BY DATE_FORMAT(date,'%M %Y')
   ) p ON m.month = p.month
   ORDER BY STR_TO_DATE(m.month, '%M %Y')
   LIMIT 20`
);

    // Create PDF
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=appointment.pdf");
    doc.pipe(res);

    // Title
    doc.fontSize(20).text("Appointments Report", { align: "center" });
    doc.moveDown();

    // Table header
    doc.fontSize(12).text("Month | Bookings | Emergencies");
doc.moveDown(0.5);

    // Loop through results
   rows.forEach(row => {
  doc.text(`${row.month} | ${row.total_bookings} | ${row.total_emergencies}`);
});

    doc.end();
   await connection.end();

  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating report");
  }
});

app.post("/report2",async(req,res) =>{
  try{
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(
      
      `SELECT SUM(education_campus) AS Parktown,SUM(other_campus) AS Main,COUNT(*) AS Total
      FROM emergency_onboarding
      `

    );
     const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=emergency.pdf");
    doc.pipe(res);

    // Title
    doc.fontSize(20).text("Emergencies Report", { align: "center" });
    doc.moveDown();

    // Table header
    doc.fontSize(12).text("Parktown | Main | Total");
doc.moveDown(0.5);

    // Loop through results
   rows.forEach(row => {
  doc.text(`${row.east_campus} | ${row.west_campus} | ${row.Total}`);
});

    doc.end();
    await connection.end();


  }
     catch(err){
      console.error(err);
      res.status(500).send("Error generating report")
     }
  
})

app.post("/report3",async(req,res) =>{
try{
 const connection = await mysql.createConnection(dbConfig);
  const [rows] = await connection.execute(
`
SELECT 
    DATE_FORMAT(uploaded_at, '%M %Y') AS month,
    COUNT(*) AS total_uploads
FROM por_uploads
GROUP BY DATE_FORMAT(uploaded_at, '%M %Y')
ORDER BY STR_TO_DATE(month, '%M %Y');
`)

  const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=POR.pdf");
    doc.pipe(res);

    // Title
    doc.fontSize(20).text("Proof of Registration", { align: "center" });
    doc.moveDown();

    // Table header
    doc.fontSize(12).text("Date of Upload |   Number of uploads");
doc.moveDown(0.5);

    // Loop through results
   rows.forEach(row => {
  doc.text(`${row.month} |  ${row.total_uploads}`);
});

    doc.end();
   await connection.end();
}
catch(err){
  console.error(err);
  res.status(500).send("Error generating report")
}
})


app.listen(3000, () => {
  console.log("Server running on port 3000");
});
