# TETFund IBR Grant Management Platform

## Product Requirements Document (PRD)

You should note that I have already started with the implementation of this already. Done everything that deals with the submission and all, so it's mainly the review remaining now. I have also done like an authentication logic for both the reviwers who'll review the proposals and researchers who submitted proposals.
I'll like something like a button at the top right of the page where research proposals are reviewed which will be called review guidelines as they'll take you to another tab where the guidelines or rules for proposal grading will be shown with examples if possible.
Also if images are added showing the ui pages build exactly what's in the image making it responsive and all while adding all the neccessary functionalities for the page that may not have been included in the PRD following the consistent design already being used.

Also this is the rules being used to assign reviewers
Review Clusters

(1) Life sciences| Agric/ Vet Medicine
(2) Pharmacy/Dentistry/Medicine/ Basic Medical Sciences
(3) Management Sciences/ Education/ Social Sciences/ Vocational Education
(4) Law/Arts/Institute of Education
(5) Engineering/ Physical Sciences/Environmental Sciences

Let me explain, If a proposal is submitted by a staff or master's student from the Engineering faculty (extract a user's faculty from the proposal submitted since it's part of the form and use), then the appropriate reviewer should be from either the faculty of physical science or environmental science but not engineering. and vice-versa for any faculty in relation to the other faculties in their respective clusters.

## 1. Introduction

### 1.1 Purpose

This document outlines the requirements for developing the TETFund Institutional Based Research (IBR) Grant Management Platform, a comprehensive system designed to streamline the submission, review, and management of research grant proposals. The platform will incorporate both human expert review and AI-assisted scoring to enhance efficiency and objectivity in the evaluation process.

### 1.2 Scope

The TETFund IBR Grant Management Platform will provide end-to-end functionality for the entire grant lifecycle, from proposal submission to final decision-making and post-award management. It will serve multiple stakeholders including applicants (researchers), reviewers, administrators, and funding decision-makers.

### 1.3 System Overview

The platform consists of:

- A web-based frontend built with React using Next.js
- A Node.js/Express backend
- MongoDB database for data storage
- AI scoring component (placeholder implementation initially)
- Human review workflow management
- Score comparison and reconciliation system
- Reporting and analytics features

## 2. User Roles and Personas

### 2.1 Applicants (Researchers)

- Academic researchers from Nigerian institutions
- Research teams with a principal investigator and collaborators
- May have varying levels of technical proficiency

### 2.2 Reviewers

- Subject matter experts in various academic fields
- Both internal and external reviewers
- Expected to provide detailed evaluations using standardized rubrics

### 2.3 Administrators

- TETFund staff responsible for managing the proposal process
- Grant officers who oversee application cycles
- Need comprehensive overview and management capabilities

### 2.4 Decision Makers

- Senior TETFund officials responsible for final funding decisions
- Committee members involved in funding allocations
- Need clear reporting and visualization of evaluation data

## 3. Functional Requirements

### 3.3 AI Review System

#### 3.3.1 Proposal Intake Processing

- Automated metadata extraction
- Field classification and categorization
- Keyword identification and tagging
- Initial completeness check
- Now when a proposal is to be put for review, to promote fairness and anonymosity, certain information like the name of the reviewer or the reviewer faculty or department, basically all information not part of the actual research proposal requirement should not be added in the proposal to be assigned to reviewers, and my staff proposals are easy to assign since it's in like a form format but for master's student, their entire information is in a document file, whether pdf or docx. so an appropriate way should be found to extract and parse it so it can be assigned to reviewers to after removing the personal information from it, the reviewers don't review documents so the info have to be extracted. If it's a staff proposal that info should be used or if it's a master's student proposal it should be used to be able to differentiate between them since they have some lightly different fields. The master's document follows this set of rules next, it has some slightly different fields from the staff proposals.

Concept Note Submission Template (Master's Students Only)

Please complete all fields clearly and accurately. Maximum of 5 pages excluding the budget appendix.

Project Title:
Provide a clear and descriptive title for your project.
Lead Researcher Information:
Full Name
Matriculation Number
Programme (e.g., MSc, MA, LLM)
Department and Faculty
Email Address
Phone Number
Problem Statement and Justification:
Briefly describe the problem your project addresses and explain why it is important.
Objectives and Anticipated Outcomes:
What are you aiming to achieve? What changes, benefits, or results do you expect from your project?
Research-Informed Approach and Methodology:
Explain how you will carry out your research, the methods you will use, and how it is informed by academic knowledge.
Innovation and Impact:
What is novel about your project?
How could your project contribute to society, culture, policy, or national development?
Interdisciplinary Relevance:
Show how your project draws from or benefits multiple fields of study, if applicable.
Implementation Plan and Timeline:
Outline the main activities and stages of the project.
Provide a realistic timeline covering completion within one academic session.
Preliminary Budget Estimate (Separate Appendix):
Break down how you propose to use the seed funding if awarded, with estimated costs.
Important Submission Details:
Concept note must not exceed 5 pages (excluding appendix).

#### 3.3.2 AI Scoring Engine (Placeholder Implementation)

- For the initial version, implement a placeholder that returns default scores
- Include system hooks for future ML model integration
- Structure to support scoring across all evaluation criteria
- Default scores should have slight variations to simulate real review patterns
- Generate templated feedback explanations

### 3.4 Human Review Workflow

#### 3.4.1 Reviewer Assignment

- Automated matching of proposals to reviewers based on the review cluster I talked about earlier
- Conflict of interest detection and prevention
- Reviewer workload balancing
- Manual assignment override for administrators
- Notification system for new review assignments

#### 3.4.2 Review Interface

- Full proposal viewing within the platform
- Side-by-side scoring rubric based on TETFund criteria
- Text fields for comments on each evaluation criterion
- Overall strengths and weaknesses sections
- Save progress functionality for in-progress reviews
- Final submission with confirmation
  -Also it should take a reviewer 5 business days to review a proposal or proposals if more than 1 is sent for review within the same time period, so maybe when It's like 2 days to the end of the 5 days period emails should be sent as reminders and also a mail should be sent if the deadline is met for unreviewed articles so the reviewer can review them.

#### 3.4.3 Scoring System

- Implementation of the TETFund IBR 100-point scoring system
- Individual scoring for each of the 10 evaluation criteria
- Running total calculation
- Score validation to ensure all criteria are addressed
- Visualization of score distribution

### 3.5 Score Comparison and Reconciliation

#### 3.5.1 Discrepancy Detection

- Automatic comparison between AI and human reviewer scores
- Threshold-based flagging of significant discrepancies
- Calculation of variance across different reviewers
- Statistical anomaly detection for potential bias or error

#### 3.5.2 Independent Escalation Process

- Assignment interface for third reviewer when discrepancies exist
- Blind review process (third reviewer doesn't know which scores came from AI vs. humans)
- Special interface for reconciliation reviewers
- Additional explanation requirements for significant score differences
- Resolution tracking and documentation
- Now the third reviewer should be choosen based on factors like, you are not the one that reviewed the proposal Initially, while still following the review cluster rules and also preferrably a reviewer without or with the less amount of discrepancies in previous proposals reviewed, also the current number of proposals the reviewer has to review, someone with a low workload will be good, just find the most efficient reviewer at any given time.

### 3.6 Decision Making and Award Management

#### 3.6.1 Final Scoring Aggregation

- Weighted averaging of scores based on configurable parameters
- Adjustment for outlier scores
- Final ranking algorithm
- Threshold determination for funding eligibility

#### 3.6.2 Committee Review Support

- Batch presentation of proposals for committee meetings
- Interactive dashboards for funding decisions
- Batch approval/rejection capabilities
- Meeting minutes and decision documentation
- Budget allocation visualization

#### 3.6.3 Award Processing

- Automatic generation of award letters
- Decline notifications with feedback compilation
- Fund disbursement scheduling
- Milestone-based payment triggering
- Contract generation and e-signature integration

### 3.7 Reporting and Analytics

#### 3.7.1 Administrative Dashboards

- Real-time status tracking of all proposals
- Review progress monitoring
- Reviewer performance metrics
- Funding allocation visualization
- Application volume trends

#### 3.7.2 Applicant Feedback

- Anonymized reviewer comments
- Score comparison to funding threshold
- Improvement suggestions for unsuccessful applications
- Historical application performance

#### 3.7.3 System Analytics

- AI vs. human reviewer agreement rates
- Proposal quality metrics over time
- Institutional success rates
- Research field distribution analysis
- Budget utilization reporting

## 4. Non-Functional Requirements

### 4.1 Performance

- Page load times under 2 seconds
- Support for concurrent users (up to 500 simultaneous users)
- Search results returned within 1 second
- Batch operations processing for up to 1000 records

### 4.5 Usability

- Responsive design for desktop, tablet, and mobile devices
- Accessibility compliance with WCAG 2.1 AA standards
- Intuitive navigation with breadcrumbs and clear user flows
- Comprehensive help documentation and tooltips
- Consistent design language across all interfaces

## 5. Technical Architecture

### 5.1 Frontend Architecture

#### 5.1.1 Technology Stack

- React.js in Next.js for component-based UI development
- Axios for API communication
- Chart.js for data visualization
- PDF.js for document viewing
- Draft.js for rich text editing

#### 5.1.2 Key Components

- Authentication components (Login)
- Dashboard layouts for each user role
- Multi-step submission wizard
- Document viewer with annotation capabilities
- Review interface with rubric implementation
- Administrative control panels
- Reporting and visualization components
- Notification center

#### 5.1.3 State Management

- Caching strategy for frequently accessed data

### 5.2 Backend Architecture

#### 5.2.2 API Structure

- RESTful API design with resource-based endpoints
- Versioned API (v1) for future compatibility
- Standard HTTP methods and status codes
- Consistent error response format
- Rate limiting for security
- Pagination for large data sets
- Filtering, sorting, and search capabilities

#### 5.2.3 Core Services

- Authentication service
- User management service
- Proposal submission service
- Review management service
- AI scoring service (placeholder)
- Notification service
- Reporting service
- Document management service

### 5.3 Database Design

#### 5.3.1 Data Models

- Users Collection

  - Authentication details
  - Profile information
  - Role assignments
  - Activity history

- Reviews Collection

  - Reviewer assignments
  - Individual criterion scores
  - Comments and feedback
  - Timestamps
  - Review status

- Scores Collection

  - AI-generated scores
  - Human reviewer scores
  - Aggregated final scores
  - Discrepancy flags
  - Reconciliation notes

- Awards Collection
  - Funding decisions
  - Disbursement schedule
  - Budget modifications

#### 5.3.2 Relationships and Indexing

- User references in proposals and reviews
- Proposal references in reviews and scores
- Compound indexes for frequent query patterns
- Text indexes for search functionality
- Time-based indexes for reporting queries

#### 5.3.3 Data Validation

- Schema-level validation rules
- Required field enforcement
- Data type constraints
- Enum values for controlled fields
- Custom validators for complex business rules

## 7. UI/UX Specifications

### 7.1 Design System

- Color palette based on TETFund brand colors
- Typography system with readable fonts for academic content
- Consistent spacing and layout grid
- Icon system for intuitive visual cues
- Loading states and animations

### 7.2 User Flows

#### 7.2.1 Applicant User Flow

1. Registration and profile completion
2. Dashboard access with application status
3. New proposal creation via multi-step wizard
4. Document uploads and form completion
5. Review and submit proposal
6. Track proposal status
7. Receive feedback and notifications
8. Award management if successful

#### 7.2.2 Reviewer User Flow

1. Login to reviewer portal
2. View assigned proposals
3. Open proposal details and supporting documents
4. Complete scoring rubric
5. Add comments and recommendations
6. Submit review
7. Participate in reconciliation if needed
8. Track review history and metrics

#### 7.2.3 Administrator User Flow

1. System configuration and setup
2. Proposal cycle management
3. Reviewer assignment and monitoring
4. Discrepancy resolution oversight
5. Final decision preparation
6. Award processing
7. Reporting and analytics review

### 7.3 Key Screens

#### 7.3.1 Applicant Screens

- Dashboard with application status cards
- Multi-step proposal submission form
- Document upload interface
- Proposal review and submission confirmation
- Status tracking page
- Feedback and scoring results view
- Award management interface

#### 7.3.2 Reviewer Screens

- Assignment dashboard with workload visualization
- Proposal viewer with navigation controls
- Side-by-side scoring interface
- Comment entry fields for each criterion
- Review history and statistics
- Reconciliation interface for escalated reviews

#### 7.3.3 Administrator Screens

- System overview dashboard
- User management interface
- Proposal management and filtering tools
- Review progress tracking
- Reconciliation management
- Decision committee interface
- Reporting and analytics dashboards
- System configuration panels

### 7.4 Responsive Design

- Desktop-first approach with full functionality
- Tablet-optimized layouts for field reviewers
- Mobile-friendly essential functions
- Print-optimized views for reports and proposals

## 8. Implementation Plan

### 8.1 Development Phases

#### 8.1.1 Phase 1: Core Platform

- User authentication and management
- Basic proposal submission functionality
- Simple review assignment and completion
- Essential administrative functions
- Database setup and core API implementation

#### 8.1.2 Phase 2: Enhanced Review System

- Placeholder AI scoring implementation
- Complete human review workflow
- Discrepancy detection and escalation
- Basic reporting and feedback mechanisms
- Document management enhancements

### 8.2 AI Integration Roadmap

#### 8.2.1 Initial Implementation

- Placeholder AI scoring system that returns default varied scores
- Framework for future AI integration
- Data collection for future model training

#### 8.2.2 Future AI Enhancement (Out of Scope for Initial Build)

- Model selection and fine-tuning
- Integration with scoring system
- Explanation generation capabilities
- Performance monitoring and improvement

## 9. Placeholder AI Scoring Implementation

Since the AI model development is not part of the initial scope, the following section outlines how to implement a placeholder that can be replaced with actual AI functionality later.

### 9.1 Mock AI Scoring Service

#### 9.1.1 Functionality

- Accept proposal ID and content as input
- Generate plausible scores for each evaluation criterion
- Apply small random variations to simulate real scoring patterns
- Return scores with templated explanations
- Log all activities for future model training

#### 9.1.2 Implementation Details

```javascript
// Sample placeholder implementation
function generateAIScore(proposalContent) {
  const baseScores = {
    relevanceToNationalPriorities: 7,
    originalityAndInnovation: 12,
    clarityOfResearchProblem: 8,
    methodology: 12,
    literatureReview: 8,
    teamComposition: 8,
    feasibilityAndTimeline: 7,
    budgetJustification: 7,
    expectedOutcomes: 4,
    sustainabilityAndScalability: 4,
  };

  // Add random variation (±20%)
  const scores = {};
  Object.keys(baseScores).forEach((criterion) => {
    const variation = Math.random() * 0.4 - 0.2; // -20% to +20%
    const baseScore = baseScores[criterion];
    const adjustedScore = Math.min(
      Math.max(Math.round(baseScore * (1 + variation)), 1),
      baseScores[criterion] // Never exceed max for criterion
    );
    scores[criterion] = adjustedScore;
  });

  // Generate templated explanations
  const explanations = {
    relevanceToNationalPriorities: `The proposal demonstrates ${scores.relevanceToNationalPriorities > 7 ? 'strong' : 'moderate'} alignment with national priorities.`,
    // Add explanations for other criteria...
  };

  return {
    scores,
    explanations,
    totalScore: Object.values(scores).reduce((sum, score) => sum + score, 0),
  };
}
```

#### 9.1.3 API Integration

- POST /api/v1/ai-scoring/analyze/:proposalId endpoint accepts proposal content
- Service processes the content and returns the generated scores
- Results are stored in the database for comparison with human reviews
- System flags any significant discrepancies for human review

## 10. Monitoring and Analytics

### 10.1 System Monitoring

- Server performance metrics
- API endpoint response times
- Error rate tracking
- Database performance monitoring
- User activity patterns
- Resource utilization

## 11. Appendices

### 11.1 Evaluation Criteria Details

The TETFund IBR evaluation uses a 100-point scoring system with the following criteria:

| Evaluation Criteria                            | Description                                                                              | Max Score |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| Relevance to National/Institutional Priorities | Alignment with Nigeria's national development goals or institutional research priorities | 10        |
| Originality and Innovation                     | Novelty of research idea; advancement of knowledge; creativity                           | 15        |
| Clarity of Research Problem and Objectives     | Clearly defined problem statement and SMART objectives                                   | 10        |
| Methodology                                    | Appropriateness, rigor, and feasibility of the research design, tools, and approach      | 15        |
| Literature Review and Theoretical Framework    | Sound grounding in existing literature; clear conceptual framework                       | 10        |
| Team Composition and Expertise                 | Appropriateness of team, interdisciplinary balance, qualifications                       | 10        |
| Feasibility and Timeline                       | Realistic scope, milestones, and timeline within funding duration                        | 10        |
| Budget Justification and Cost-Effectiveness    | Clear and justified budget aligned with project goals                                    | 10        |
| Expected Outcomes and Impact                   | Potential contributions to policy, community, academia, industry                         | 5         |
| Sustainability and Scalability                 | Potential for continuation, replication, or scale-up beyond funding                      | 5         |

### 11.3 Database Schema Details

Detailed MongoDB schema definitions for all collections with field types, validations, and relationships.

### 11.4 API Response Format Standards

Standard format for all API responses including success/error handling, pagination, and metadata.

## 12. Glossary

- **TETFund**: Tertiary Education Trust Fund, the Nigerian government agency responsible for managing educational grants
- **IBR**: Institutional Based Research, a grant program for Nigerian institutions
- **AI Scoring**: Automated evaluation of proposals using artificial intelligence
- **Discrepancy Detection**: Process of identifying significant differences between reviewer scores
- **Reconciliation**: Process to resolve scoring differences through additional expert review
- **SMART Objectives**: Specific, Measurable, Achievable, Relevant, Time-bound objectives

---

This PRD is a living document subject to revision as the project evolves. All stakeholders should review and provide feedback to ensure comprehensive coverage of requirements.
