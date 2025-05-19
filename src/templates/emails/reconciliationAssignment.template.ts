import { commonStyles, commonFooter } from './styles';

export const reconciliationAssignmentTemplate = (
  reviewerName: string,
  proposalTitle: string,
  reviewUrl: string,
  dueDate: Date,
  reviewCount: number,
  averageScore: number,
  scores: number[]
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
        .scores-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        .scores-table th, .scores-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: center;
        }
        .scores-table th {
            background-color: #f2f2f2;
        }
        .discrepancy-notice {
            color: #8B008B;
            font-weight: bold;
            padding: 10px;
            background-color: #f8e0f5;
            border-left: 3px solid #AA319A;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Reconciliation Review Assignment</h1>
    </div>
    
    <div class="content">
        <p>Dear <strong>${reviewerName}</strong>,</p>
        
        <p>You have been assigned as a reconciliation reviewer for the proposal titled:</p>
        
        <div class="proposal-title">"${proposalTitle}"</div>
        
        <p class="discrepancy-notice">This proposal has received significantly divergent scores from previous reviewers, requiring a reconciliation review.</p>
        
        <p>There ${reviewCount === 1 ? 'has been' : 'have been'} ${reviewCount} previous ${reviewCount === 1 ? 'review' : 'reviews'} with the following scores:</p>
        
        <table class="scores-table">
            <tr>
                <th>Review Scores</th>
                <th>Average Score</th>
            </tr>
            <tr>
                <td>${scores.join(', ')}</td>
                <td>${averageScore.toFixed(1)}</td>
            </tr>
        </table>
        
        <p>Your task is to provide an independent assessment and help resolve the scoring discrepancies. Please complete your reconciliation review by:</p>
        
        <p class="deadline-notice"><strong>${new Date(
          dueDate
        ).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}</strong></p>
        
        <a href="${reviewUrl}" class="button">Start Reconciliation Review</a>
        
        <p>Your expert judgment is vital in ensuring a fair and thorough evaluation process for this proposal.</p>
        
        <p>For any questions regarding this reconciliation assignment, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
