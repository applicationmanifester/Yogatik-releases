import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', style, ...props }) => {
  return (
    <button className={`btn btn-${variant} ${className}`} style={style} {...props}>
      {children}
    </button>
  );
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ children, className = '', style, ...props }) => {
  return (
    <div className={`card ${className}`} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', ...style }} {...props}>
      {children}
    </div>
  );
};

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading: React.FC<HeadingProps> = ({ level = 1, children, className = '', style, ...props }) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return React.createElement(Tag, { className: `heading heading-${level} ${className}`, style, ...props }, children);
};

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const Text: React.FC<TextProps> = ({ children, className = '', style, ...props }) => {
  return (
    <p className={`text ${className}`} style={style} {...props}>
      {children}
    </p>
  );
};
