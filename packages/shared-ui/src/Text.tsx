import styled from 'styled-components';

export interface TextProps {
  variant?: 'body' | 'caption' | 'subtitle';
  color?: 'default' | 'muted' | 'inherit';
  children: React.ReactNode;
}

const TextBase = styled.p`
  margin: 0;
  line-height: 1.5;
`;

const variants = {
  body: {
    fontSize: '0.875rem',
    color: '#1e293b',
  },
  caption: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  subtitle: {
    fontSize: '0.813rem',
    fontWeight: 500,
    color: '#3b82f6',
  },
};

export const Text = ({
  variant = 'body',
  color = 'default',
  children,
}: TextProps) => {
  const styles = variants[variant];

  return (
    <TextBase
      style={{
        ...styles,
        color: color === 'inherit' ? 'inherit' : styles.color,
      }}
    >
      {children}
    </TextBase>
  );
};