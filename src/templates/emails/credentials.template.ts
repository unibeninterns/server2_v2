import { commonStyles, commonFooter } from './styles';

export const credentialsTemplate = (
  email: string,
  password: string,
  loginUrl: string
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>Your Research Portal Account Credentials</h1>
    </div>
    
    <div class="content">
        <p>Your account has been created successfully on the University of Benin Research Portal.</p>
        
        <div class="credentials">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
        </div>
        
        <p>Please click the button below to log in to your account:</p>
        
        <a href="${loginUrl}" class="button">Log In to Portal</a>
        
        <p>If you did not expect to receive this email, please contact the Research Directorate immediately.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
