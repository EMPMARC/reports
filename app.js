const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");
const PDFDocument = require("pdfkit");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const dbConfig = {
  host: "chwc-database.choewaaukon8.eu-west-2.rds.amazonaws.com",
  user: "admin",
  password: "CHWC2025Project",
  database: "chwc"
};

// chart canvas setup
const width = 600;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// 🔹 Helper function: Draws a clean table
function drawTable(doc, headers, rows, columnPositions) {
  const tableTop = doc.y;
  const rowHeight = 20;

  // Header row
  doc.font("Helvetica-Bold").fontSize(12);
  headers.forEach((header, i) => {
    doc.text(header, columnPositions[i], tableTop);
  });

  // Line under header
  doc.moveTo(columnPositions[0], tableTop + 15).lineTo(550, tableTop + 15).stroke();

  // Data rows
  doc.font("Helvetica").fontSize(11);
  let y = tableTop + 25;

  rows.forEach(row => {
    row.forEach((cell, i) => {
      doc.text(cell.toString(), columnPositions[i], y);
    });

    // Optional row separator
    doc.moveTo(columnPositions[0], y + 15).lineTo(550, y + 15)
       .dash(1, { space: 2 }).stroke().undash();

    y += rowHeight;
  });

  doc.moveDown();
}

app.get("/report", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});


// 🔹 Report 1: Appointments (Line Chart: Bookings vs Emergencies)
app.post("/report1", async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(`
      SELECT 
          m.month,
          COALESCE(a.total_bookings, 0) AS total_bookings,
          COALESCE(p.total_emergencies, 0) AS total_emergencies
      FROM (
          SELECT DATE_FORMAT(appointment_date,'%M' ) AS month
          FROM appointments WHERE appointment_date IS NOT NULL
          UNION
          SELECT DATE_FORMAT(date,'%M ') AS month
          FROM emergency_onboarding WHERE date IS NOT NULL
      ) m
      LEFT JOIN (
          SELECT DATE_FORMAT(appointment_date,'%M ') AS month,
                 COUNT(*) AS total_bookings
          FROM appointments
          WHERE appointment_date IS NOT NULL
          GROUP BY DATE_FORMAT(appointment_date,'%M ')
      ) a ON m.month = a.month
      LEFT JOIN (
          SELECT DATE_FORMAT(date,'%M ') AS month,
                 COUNT(*) AS total_emergencies
          FROM emergency_onboarding
          WHERE date IS NOT NULL
          GROUP BY DATE_FORMAT(date,'%M ')
      ) p ON m.month = p.month
      ORDER BY STR_TO_DATE(m.month, '%M ')
    `);

    const labels = rows.map(r => r.month);
    const bookings = rows.map(r => r.total_bookings);
    const emergencies = rows.map(r => r.total_emergencies);

    const chartConfig = {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Bookings", data: bookings, borderColor: "yellow", backgroundColor: "yellow", fill: false },
          { label: "Emergencies", data: emergencies, borderColor: "red", backgroundColor: "red", fill: false }
        ]
      },
      options: {
        scales: {
          x: { title: { display: true, text: "Month" }, ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 } },
          y: { title: { display: true, text: "Count" }, beginAtZero: true }
        }
      }
    };
    const chartImage = await chartJSNodeCanvas.renderToBuffer(chartConfig);

    // PDF
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=appointment.pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Appointments Report", { align: "center" });
    doc.moveDown();
    doc.image(chartImage, { fit: [500, 300], align: "center" });
    doc.moveDown();

    drawTable(
      doc,
      ["Month", "Bookings", "Emergencies"],
      rows.map(r => [r.month, r.total_bookings, r.total_emergencies]),
      [50, 250, 400]
    );

    doc.end();
    await connection.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating report1");
  }
});


// 🔹 Report 2: Emergencies (Pie Chart + Table)
app.post("/report2", async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(`
      SELECT 
        SUM(education_campus) AS Parktown,
        SUM(other_campus) AS Main,
        COUNT(*) AS Total
      FROM emergency_onboarding
    `);

    const row = rows[0];

    const chartConfig = {
      type: "pie",
      data: {
        labels: ["Parktown", "Main"],
        datasets: [{ data: [row.Parktown || 0, row.Main || 0], backgroundColor: ["orange", "green"] }]
      }
    };
    const chartImage = await chartJSNodeCanvas.renderToBuffer(chartConfig);

    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=emergency.pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Emergencies Report", { align: "center" });
    doc.moveDown();
    doc.image(chartImage, { fit: [400, 300], align: "center" });
    doc.moveDown();

    drawTable(
      doc,
      ["Parktown", "Main", "Total"],
      [[row.Parktown || 0, row.Main || 0, row.Total || 0]],
      [50, 250, 400]
    );

    doc.end();
    await connection.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating report2");
  }
});


// 🔹 Report 3: POR Uploads vs Bookings (Line Chart + Table)
app.post("/report3", async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(`
      SELECT 
        m.month,
        COALESCE(a.total_bookings, 0) AS total_bookings,
        COALESCE(p.total_uploads, 0) AS total_uploads
      FROM (
        SELECT DATE_FORMAT(appointment_date, '%M ') AS month
        FROM appointments WHERE appointment_date IS NOT NULL
        UNION
        SELECT DATE_FORMAT(uploaded_at, '%M ') AS month
        FROM por_uploads WHERE uploaded_at IS NOT NULL
      ) m
      LEFT JOIN (
        SELECT DATE_FORMAT(appointment_date, '%M ') AS month,
               COUNT(*) AS total_bookings
        FROM appointments
        WHERE appointment_date IS NOT NULL
        GROUP BY DATE_FORMAT(appointment_date, '%M ')
      ) a ON m.month = a.month
      LEFT JOIN (
        SELECT DATE_FORMAT(uploaded_at, '%M ') AS month,
               COUNT(*) AS total_uploads
        FROM por_uploads
        WHERE uploaded_at IS NOT NULL
        GROUP BY DATE_FORMAT(uploaded_at, '%M ')
      ) p ON m.month = p.month
      ORDER BY STR_TO_DATE(m.month, '%M ')
    `);

    const labels = rows.map(r => r.month);
    const uploads = rows.map(r => r.total_uploads);
    const bookings = rows.map(r => r.total_bookings);

    const chartConfig = {
      type: "line",
      data: {
        labels,
        datasets: [
          { 
            label: "POR Uploads", 
            data: uploads, 
            borderColor: "yellow", 
            backgroundColor: "yellow", 
            fill: false 
          },
          { 
            label: "Bookings", 
            data: bookings, 
            borderColor: "red", 
            backgroundColor: "red", 
            fill: false 
          }
        ]
      },
      options: {
        scales: {
          x: { title: { display: true, text: "Month" }, ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 } },
          y: { title: { display: true, text: "Count" }, beginAtZero: true }
        }
      }
    };
    const chartImage = await chartJSNodeCanvas.renderToBuffer(chartConfig);

  
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=POR.pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Proof of Registration Uploads vs Bookings", { align: "center" });
    doc.moveDown();
    doc.image(chartImage, { fit: [500, 300], align: "center" });
    doc.moveDown();

    drawTable(
      doc,
      ["Month", "POR Uploads", "Bookings"],
      rows.map(r => [r.month, r.total_uploads, r.total_bookings]),
      [50, 250, 400]
    );

    doc.end();
    await connection.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating report3");
  }
});


app.listen(3000, () => {
  console.log("Server running on port 3000");
});
