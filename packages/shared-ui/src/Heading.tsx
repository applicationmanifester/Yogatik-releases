import styled from 'styled-components';

export interface HeadingProps {
  level?: 1 | 2 | 3;
  children: React.ReactNode;
}

const HeadingBase = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.25;
  color: #1e293b;
  margin: 0 0 1rem;
`;

const Heading2 = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: #1e293b;
  margin: 0 0 1rem;
`;

const Heading3 = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  color: #3b82f6;
  margin: 0 0 1rem;
`;

export const Heading = ({ level = 1, children }: HeadingProps) => {
  switch (level) {
    case 1:
      return <HeadingBase>{children}</HeadingBase>;
    case 2:
      return <Heading2>{children}</Heading2>;
    case 3:
      return <Heading3>{children}</Heading3>;
    default:
      return <HeadingBase>{children}</HeadingBase>;
  }
};