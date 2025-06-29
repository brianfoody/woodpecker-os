import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

import {
  askAI,
  chooseTaskForSelectedArea,
  extractContact,
  extractSmartMessage,
  findSmartContact,
  setGroqClient,
} from "./ai";
import Groq from "groq-sdk";

describe("evals", () => {
  beforeAll(() => {
    setGroqClient(
      new Groq({
        apiKey: process.env.GROQ_API_KEY,
        fetch: fetch as any,
      })
    );
  });

  describe("chooseTaskForSelectedArea", () => {
    test("it suggests ask AI as expected", async () => {
      const task = await chooseTaskForSelectedArea({
        task: "What are some good actions here?",
      });

      console.log(JSON.stringify(task));

      expect(task.actions[0].action === "ask_ai");
    });

    test("it suggests search for things like stock prices", async () => {
      const task = await chooseTaskForSelectedArea({
        task: "What's the APPL price?'",
      });

      console.log(JSON.stringify(task));

      expect(task.actions[0].action === "search");
    });

    test("it suggests message when customer asks to message someone", async () => {
      const task = await chooseTaskForSelectedArea({
        task: "Send to Tony",
      });

      console.log(JSON.stringify(task));

      expect(task.actions[0].action === "send_message");
    });

    test("it suggests add to contacts if a phone number and name are circled", async () => {
      const task = await chooseTaskForSelectedArea({
        task: "+614919393233 Brian",
      });

      console.log(JSON.stringify(task));

      expect(task.actions[0].action === "add_contact");
      expect(task.actions[0].action === "send_message");
    });
  });

  describe("askAI", () => {
    test("returns content inside a div", async () => {
      const response = await askAI({
        image_summary: "The words 'What is an elephants weight?' handwritten.",
      });

      console.log(response);

      expect(response.startsWith("<div>")).toBeTruthy();
      expect(response.endsWith("</div>")).toBeTruthy();
    });
  });

  describe("extractContact", () => {
    test("returns the contact as expected", async () => {
      const response = await extractContact({
        image_summary:
          'User has circled the following content on their e-ink display: The image appears to be a simple, handwritten-style text on a white background. \n\n* The top line of text reads: "+61488 04372"\n* The bottom line of text reads: "Brian"\n\nThis seems to be a phone number and the name of the person associated with it.. \nBounds: 606.9200000000001x388.48 area at position (-257.44252261315796, 161.61038776413943). \nShapes detected: 22 (draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw). \nPlease suggest actionable tasks the user might want to execute based on this content.',
      });

      console.log(response);

      expect(response.name.toLowerCase()).toEqual("brian");
      expect(response.phoneNumber.toLowerCase()).toEqual("+6148804372");
    });
  });

  describe("extractSmartMessage", () => {
    test("returns the message as expected", async () => {
      const response = await extractSmartMessage({
        image_summary:
          'User has circled the following content on their e-ink display: The image appears to be a simple, handwritten-style text on a white background. \n\n* The top line of text reads: "Be there at 10:15."\n* The bottom line of text reads: "Brian"\n\nThis seems to be a phone number and the name of the person associated with it.. \nBounds: 606.9200000000001x388.48 area at position (-257.44252261315796, 161.61038776413943). \nShapes detected: 22 (draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw). \nPlease suggest actionable tasks the user might want to execute based on this content.',
        contacts: [
          {
            name: "Sarah",
            phoneNumber: "+61412345678",
          },
          {
            name: "Michael",
            phoneNumber: "+61487654321",
          },
          {
            name: "Brian",
            phoneNumber: "+61488057723",
          },
          {
            name: "Emma",
            phoneNumber: "+61455556666",
          },
        ],
      });

      console.log(response);

      expect(response.name.toLowerCase()).toEqual("brian");
      expect(response.phoneNumber.toLowerCase()).toEqual("+61488057723");
      expect(response.text.toLowerCase()).toEqual("be there at 10:15.");
    });
  });

  describe("findSmartContact", () => {
    test("returns the message as expected", async () => {
      const response = await findSmartContact({
        image_summary:
          'User has circled the following content on their e-ink display: The image appears to be a simple, handwritten-style text on a white background. \n\n* The top line of text reads: "Need to check what Brian is up to."\n* The bottom line of text reads: "Get messages from Brian."\n\nThis seems to be a note and the name of person associated with it.. \nBounds: 606.9200000000001x388.48 area at position (-257.44252261315796, 161.61038776413943). \nShapes detected: 22 (draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw, draw). \nPlease suggest actionable tasks the user might want to execute based on this content.',
        contacts: [
          {
            name: "Sarah",
            phoneNumber: "+61412345678",
          },
          {
            name: "Michael",
            phoneNumber: "+61487654321",
          },
          {
            name: "Brian",
            phoneNumber: "+61488057723",
          },
          {
            name: "Emma",
            phoneNumber: "+61455556666",
          },
        ],
      });

      console.log(response);

      expect(response.name.toLowerCase()).toEqual("brian");
      expect(response.phoneNumber.toLowerCase()).toEqual("+61488057723");
    });
  });
});
