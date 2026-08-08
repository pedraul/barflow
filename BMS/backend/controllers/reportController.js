export async function getReports(_req, res) {
  try {
    res.json({ message: 'Reports are computed per role in the dashboards.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
