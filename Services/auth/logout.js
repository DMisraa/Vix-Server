export function logout(req, res) {
  
  // Clear all authentication cookies with proper options
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
  };

  // Clear old jwtToken cookie (backward compatibility)
  res.clearCookie('jwtToken', cookieOptions);
  
  // Clear accessToken cookie (new system)
  res.clearCookie('accessToken', cookieOptions);
  
  // Clear refreshToken cookie (new system)
  res.clearCookie('refreshToken', cookieOptions);
  
  // Clear any other token cookies
  res.clearCookie('token', cookieOptions);

  console.log('All authentication cookies cleared successfully');
  res.json({ message: "Logged out successfully" });
} 