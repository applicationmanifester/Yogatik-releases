import styled from 'styled-components';

export interface CardProps {
  header?: string;
  children: React.ReactNode;
  className?: string;
}

const CardContainer = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  overflow: hidden;
  border: 1px solid #e2e8f0;
`;

const CardHeader = styled.div`
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
`;

const CardContent = styled.div`
  padding: 1.5rem;
`;

export const Card = ({ header, children, className }: CardProps) => {
  return (
    <CardContainer className={className}>
      {header && <CardHeader>{header}</CardHeader>}
      <CardContent>{children}</CardContent>
    </CardContainer>
  );
};