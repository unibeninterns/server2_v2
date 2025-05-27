import { commonStyles, commonFooter } from './styles';

export const aiReviewFailureTemplate = (
  proposalId: string,
  errorMessage: string
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Review Generation Failed</h1>
    </div>
    
    <div class="content">
        <p>An error occurred while generating the AI review for proposal ID: <strong>${proposalId}</strong>.</p>
        
        <div class="error-details">
            <p><strong>Error Details:</strong></p>
            <pre>${errorMessage}</pre>
        </div>
        
        <p>Please investigate the server logs for more details.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
