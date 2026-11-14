import { useParams } from "react-router-dom";
import MessagingWorkspace from "./MessagingWorkspace";

export default function ConversationPage() {
  const { conversationId } = useParams();
  return <MessagingWorkspace activeId={conversationId} />;
}
