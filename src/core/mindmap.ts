export function buildPrompt(subject: string, topic: string): string {
  const mindMapDataStructure = `
  {
    "root": "string",
    "children": [
      {
        "title": "string",
        "children": [
          {
            "title": "string"
          }
        ]
      }
    ]
  }
  `.trim()

  return `
  You are a professional teacher in ${subject}.
  Your goal is to generate a mind map for the subject above with the focus on ${topic}, so that a student can improve their understanding of ${subject} and ${topic} while using that mind map.
  The mind map should feature sub-topics of ${topic} and no other content.
  The result of your work must be a mind map in the form of JSON using the following data structure:
  ${mindMapDataStructure}
  `.trim()
}
