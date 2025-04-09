import { MindMap, MindMapNode, ProcessingResult } from '../src/types/index.js'

export const TestFixtures = {
  basicMindMap: (): MindMap => ({
    id: 'test-uuid-1',
    subject: 'Mathematics',
    topic: 'Algebra',
    root: {
      id: 'root-1',
      text: 'Algebra',
      children: [
        {
          id: 'child-1',
          text: 'Equations',
          children: []
        }
      ]
    },
    createdAt: '2025-04-10T12:00:00.000Z'
  }),

  complexMindMap: (): MindMap => ({
    id: 'test-uuid-2',
    subject: 'Physics',
    topic: 'Mechanics',
    root: {
      id: 'root-2',
      text: 'Mechanics',
      children: [
        {
          id: 'child-2-1',
          text: 'Forces',
          children: [
            {
              id: 'child-2-1-1',
              text: "Newton's Laws",
              children: [
                { id: 'child-2-1-1-1', text: 'First Law' },
                { id: 'child-2-1-1-2', text: 'Second Law' },
                { id: 'child-2-1-1-3', text: 'Third Law' }
              ]
            },
            {
              id: 'child-2-1-2',
              text: 'Friction',
              children: []
            }
          ]
        },
        {
          id: 'child-2-2',
          text: 'Motion',
          children: [
            { id: 'child-2-2-1', text: 'Velocity' },
            { id: 'child-2-2-2', text: 'Acceleration' }
          ]
        }
      ]
    },
    createdAt: '2025-04-10T12:30:00.000Z'
  }),

  multipleMindMaps: (): MindMap[] => [
    TestFixtures.basicMindMap(),
    TestFixtures.complexMindMap(),
    {
      id: 'test-uuid-3',
      subject: 'Biology',
      topic: 'Cells',
      root: {
        id: 'root-3',
        text: 'Cells',
        children: [
          { id: 'child-3-1', text: 'Animal Cells' },
          { id: 'child-3-2', text: 'Plant Cells' }
        ]
      },
      createdAt: '2025-04-10T13:00:00.000Z'
    }
  ],

  sampleNode: (): MindMapNode => ({
    id: 'node-1',
    text: 'Sample Node',
    children: [
      { id: 'node-1-1', text: 'Child 1' },
      { id: 'node-1-2', text: 'Child 2' }
    ]
  }),

  openAIResponse: (includeMindMap: boolean = true) => ({
    choices: [
      {
        message: {
          content: includeMindMap
            ? JSON.stringify({
                root: {
                  text: 'Test Topic',
                  children: [
                    {
                      text: 'Subtopic 1',
                      children: [{ text: 'Detail 1' }, { text: 'Detail 2' }]
                    },
                    {
                      text: 'Subtopic 2',
                      children: [{ text: 'Detail 3' }]
                    }
                  ]
                }
              })
            : 'This is not valid JSON'
        }
      }
    ]
  }),

  processingResults: (): ProcessingResult[] => [
    { topic: 'Algebra', status: 'Success' },
    { topic: 'Geometry', status: 'Success' },
    { topic: 'Calculus', status: 'Failure', error: 'Failed to process' }
  ],

  csvInputContent: (): string =>
    'subject,topic\n' +
    'Mathematics,Algebra\n' +
    'Mathematics,Geometry\n' +
    'Physics,Mechanics',

  csvOutputContent: (): string =>
    'topic,status\n' +
    'Algebra,Success\n' +
    'Geometry,Success\n' +
    'Mechanics,Failure'
}

export default TestFixtures
