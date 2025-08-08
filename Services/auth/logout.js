export function logout(req, res) {
  console.log('=== LOGOUT REQUEST ===');
  
  // Clear cookies by setting them to expire in the past
  res.clearCookie('jwtToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
  });
  
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
  });

  console.log('User logged out successfully');
  res.json({ message: "Logged out" });
} 