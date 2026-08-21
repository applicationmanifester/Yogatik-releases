import React from 'react';
import { Button, Card, Heading, Text } from '@my-app/shared-ui';

export default function App() {
  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <Heading level={1}>Yogatik Web App</Heading>
      <Card style={{ marginTop: '16px' }}>
        <Heading level={2}>Welcome to Yogatik Web</Heading>
        <Text>Full suite of AI tools and agent automation in your browser.</Text>
        <Button style={{ marginTop: '12px' }}>Get Started</Button>
      </Card>
    </div>
  );
}
