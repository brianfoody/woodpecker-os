import Groq from "groq-sdk";
import { SmartContact, SmartMessage, SmartTask } from "./models";

let client: Groq;

export const setGroqClient = (_groq: Groq) => {
  client = _groq;
};

const getGroq = () => {
  if (!client) {
    client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  return client;
};

export const summariseImage = async ({
  base64PngImage,
}: {
  base64PngImage: string;
}): Promise<string> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe what you see inside this image",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64PngImage}`,
            },
          },
        ],
      },
    ],
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
  });

  return chatCompletion.choices[0].message.content!;
};

export const chooseTaskForSelectedArea = async ({
  task,
}: {
  task: string;
}): Promise<{ actions: SmartTask[] }> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a helpful AI assistant that enhances e-ink displays with context aware actions for users.
        
We support four actions right now;

<supported_actions>
ask_ai = Ask AI a question. This would be used if they highlight topics which appear to ask general knowledge questions or feedback on what they are working on.
search = Search the web for a very specific answer. For example, weather, news, opening hours etc..
send_message = Send a message to a user if they have highlighted what appears to be a request to send a message to a user.
add_contact = Called when a phone number and name is circled.
read_contact_messages = Called when a contact name is circled with words suggesting to read the messages.
</supported_actions>

You will provided a section of the display the user has highlighted. Please suggest the liklihood of each action.

Please return your responses as actions in this JSON format;
{
    "actions": [
        {
            "action": "ask_ai" | "search" | "send_message" | "add_contact" | "read_contact_messages",
            "text": "<>",
            "confidence_score": 0.25, 
        }
    ]
}

confidence_score is a number between 0 and 1.

Example input:
The image shows the handwritten words "Macro compute trends".

Example response:
{
    "actions": [
        {
            "action": "ask_ai",
            "text": "Ask AI about current macro compute trends",
            
            "confidence_score": 0.9
        },
        {
            "title": "search",
            "detail": "Search for news on current macro compute trends",
            "confidence_score": 0.6
        },
        {
            "title": "send_message",
            "detail": "Send message to 'Linus'",
            "confidence_score": 0.4
        },
        {
            "title": "add_contact",
            "detail": "Add 'Linus' to contacts",
            "confidence_score": 0.4
        }
    ]
}`,
      },
      {
        role: "user",
        content: task,
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(chatCompletion.choices[0].message.content!);

  // Sort actions by confidence_score in descending order
  const actions: SmartTask[] = result.actions.sort(
    (a: SmartTask, b: SmartTask) => b.confidence_score - a.confidence_score
  );

  const decisiveTask = hasDecisiveAnswer({ actions });

  if (decisiveTask) {
    return { actions: [actions[0]] };
  }

  return { actions };
};

export const hasDecisiveAnswer = (props: { actions: SmartTask[] }): boolean => {
  // Check if we have any actions
  if (!props.actions || props.actions.length === 0) {
    return false;
  }

  // Get the highest confidence score (actions are already sorted by confidence_score descending)
  const topTask = props.actions[0];

  // Check if the top task has confidence above 0.8
  if (topTask.confidence_score <= 0.8) {
    return false;
  }

  // If there's only one task, and it's above 0.8, it's decisive
  if (props.actions.length === 1) {
    return true;
  }

  // Check if there's at least 0.05 gap between top task and second highest
  const secondTask = props.actions[1];
  const confidenceGap = topTask.confidence_score - secondTask.confidence_score;

  return confidenceGap >= 0.05;
};

export const askAI = async ({
  image_summary,
}: {
  image_summary: string;
}): Promise<string> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a helpful AI assistant that enhances e-ink displays with context aware actions and results for users.

The user has highlighted a section of the display and asked for a reply.

A description of the highlighted section will be provided as well as the task the user has confirmed to be actioned

Please answer the user. Output your response in an html div.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<image_summary>${image_summary}</image_summary>`,
          },
        ],
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "text" },
  });

  return chatCompletion.choices[0].message.content!;
};

export const extractContact = async ({
  image_summary,
}: {
  image_summary: string;
}): Promise<SmartContact> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a helpful AI assistant that enhances e-ink displays with context aware actions and results for users.

The user has highlighted a section of text with a name and contact number.

Please return JSON with the contact name and number.

Example response:
{
    "contact": {
        "name": "Brian",
        "phoneNumber": "+61488057732"
    }
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<image_summary>${image_summary}</image_summary>`,
          },
        ],
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(chatCompletion.choices[0].message.content!);

  return {
    name: data?.contact?.name || data.name,
    phoneNumber: (data?.contact?.phoneNumber || data.phoneNumber)
      .replace(/ /g, "")
      .trim(),
  };
};

export const extractSmartMessage = async ({
  contacts,
  image_summary,
}: {
  contacts: SmartContact[];
  image_summary: string;
}): Promise<SmartMessage> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a helpful AI assistant that enhances e-ink displays with context aware actions and results for users.

The user has highlighted a section of text with a message they wish to send to a contact.

Their list of contacts will also be supplied.

Please return the name and number of the contact and the message to send to them in json.

Example response:
{
    "message": {
        "name": "Brian",
        "phoneNumber": "+61488057723",
        "text": "Meet you at 10:15."
    }
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<image_summary>${image_summary}</image_summary>
            
<contacts>${JSON.stringify(contacts, null, 2)}</contacts>`,
          },
        ],
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(chatCompletion.choices[0].message.content!);

  return {
    name: data?.message?.name || data.name,
    phoneNumber: (data?.message?.phoneNumber || data.phoneNumber)
      .replace(/ /g, "")
      .trim(),
    text: data?.message?.text || data.text,
  };
};

export const findSmartContact = async ({
  contacts,
  image_summary,
}: {
  contacts: SmartContact[];
  image_summary: string;
}): Promise<SmartContact> => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a helpful AI assistant that enhances e-ink displays with context aware actions and results for users.

The user has highlighted a section of text with the name of a contact they would like to see messages from.

Their list of contacts will also be supplied.

Please find the contact which is the closest match and return as json.

Example response:
{
    "contact": {
        "name": "Brian",
        "phoneNumber": "+61488057732"
    }
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<image_summary>${image_summary}</image_summary>
            
<contacts>${JSON.stringify(contacts, null, 2)}</contacts>`,
          },
        ],
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(chatCompletion.choices[0].message.content!);

  return {
    name: data?.contact?.name || data.name,
    phoneNumber: (data?.contact?.phoneNumber || data.phoneNumber)
      .replace(/ /g, "")
      .trim(),
  };
};

// const sampleImageRequest = async ({}:) => {
//   const chatCompletion = await client.chat.completions.create({
//     messages: [
//       {
//         role: "user",
//         content: [
//           {
//             type: "text",
//             text: "Describe what you see inside this image",
//           },
//           {
//             type: "image_url",
//             image_url: {
//               url: "data:image/png;base64,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",
//             },
//           },
//         ],
//       },
//       // { type: "image_url", image_url: "" } as ChatCompletionContentPartImage,
//     ],
//     model: "meta-llama/llama-4-scout-17b-16e-instruct",
//   });

//   console.log(chatCompletion.choices[0].message);
// };

// exec();
