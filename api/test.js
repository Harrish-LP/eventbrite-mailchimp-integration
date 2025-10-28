export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    token: process.env.EVENTBRITE_VERIFICATION_TOKEN || "undefined",
  });
}
