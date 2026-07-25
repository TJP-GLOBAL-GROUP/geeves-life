import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  Shirt,
  UtensilsCrossed,
  Heart,
  Cake,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Relationship labels are free-text in the household member system.
// These are common suggestions but users can type anything.
const RELATIONSHIPS = ["Child", "Parent", "Partner", "Co-parent", "Sibling", "Grandparent", "Caregiver", "Other"];

type ClothingSizes = { top?: string; bottom?: string; shoe?: string; dress?: string };
type Preferences = { favoriteColors?: string[]; brands?: string[]; notes?: string };

export default function Family() {
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.family.list.useQuery();
  const createMember = trpc.family.create.useMutation({
    onSuccess: () => { utils.family.list.invalidate(); setOpen(false); toast.success("Family member added"); },
  });
  const updateMember = trpc.family.update.useMutation({
    onSuccess: () => { utils.family.list.invalidate(); setEditOpen(false); toast.success("Profile updated"); },
  });
  const deleteMember = trpc.family.delete.useMutation({
    onSuccess: () => { utils.family.list.invalidate(); toast.success("Family member removed"); },
  });

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [dressSize, setDressSize] = useState("");
  const [dietary, setDietary] = useState("");
  const [favColors, setFavColors] = useState("");
  const [favBrands, setFavBrands] = useState("");
  const [prefNotes, setPrefNotes] = useState("");

  const resetForm = () => {
    setName(""); setRelationship(""); setBirthDate(""); setTopSize(""); setBottomSize("");
    setShoeSize(""); setDressSize(""); setDietary(""); setFavColors(""); setFavBrands(""); setPrefNotes("");
  };

  const handleCreate = () => {
    if (!name.trim() || !relationship) return;
    createMember.mutate({
      name: name.trim(),
      relationship,
      birthDate: birthDate || null,
      clothingSizes: { top: topSize, bottom: bottomSize, shoe: shoeSize, dress: dressSize },
      dietaryRestrictions: dietary ? dietary.split(",").map(d => d.trim()) : [],
      preferences: {
        favoriteColors: favColors ? favColors.split(",").map(c => c.trim()) : [],
        brands: favBrands ? favBrands.split(",").map(b => b.trim()) : [],
        notes: prefNotes,
      },
    });
    resetForm();
  };

  const handleEdit = (member: any) => {
    setEditingId(member.id);
    setName(member.name);
    setRelationship(member.relationship);
    setBirthDate(member.birthDate || "");
    const sizes = (member.clothingSizes || {}) as ClothingSizes;
    setTopSize(sizes.top || "");
    setBottomSize(sizes.bottom || "");
    setShoeSize(sizes.shoe || "");
    setDressSize(sizes.dress || "");
    const dietArr = (member.dietaryRestrictions || []) as string[];
    setDietary(dietArr.join(", "));
    const prefs = (member.preferences || {}) as Preferences;
    setFavColors((prefs.favoriteColors || []).join(", "));
    setFavBrands((prefs.brands || []).join(", "));
    setPrefNotes(prefs.notes || "");
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingId || !name.trim() || !relationship) return;
    updateMember.mutate({
      id: editingId,
      name: name.trim(),
      relationship,
      birthDate: birthDate || null,
      clothingSizes: { top: topSize, bottom: bottomSize, shoe: shoeSize, dress: dressSize },
      dietaryRestrictions: dietary ? dietary.split(",").map(d => d.trim()) : [],
      preferences: {
        favoriteColors: favColors ? favColors.split(",").map(c => c.trim()) : [],
        brands: favBrands ? favBrands.split(",").map(b => b.trim()) : [],
        notes: prefNotes,
      },
    });
  };

  const MemberForm = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input placeholder="e.g., Marcus Jr." value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Relationship</Label>
          <Select value={relationship} onValueChange={setRelationship}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Birth Date</Label>
        <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Shirt className="h-4 w-4" /> Clothing Sizes</Label>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Top</Label>
            <Input placeholder="M" value={topSize} onChange={(e) => setTopSize(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bottom</Label>
            <Input placeholder="32" value={bottomSize} onChange={(e) => setBottomSize(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Shoe</Label>
            <Input placeholder="10" value={shoeSize} onChange={(e) => setShoeSize(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dress</Label>
            <Input placeholder="8" value={dressSize} onChange={(e) => setDressSize(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Dietary Restrictions</Label>
        <Input placeholder="e.g., gluten-free, nut allergy (comma separated)" value={dietary} onChange={(e) => setDietary(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Heart className="h-4 w-4" /> Preferences</Label>
        <Input placeholder="Favorite colors (comma separated)" value={favColors} onChange={(e) => setFavColors(e.target.value)} className="mb-2" />
        <Input placeholder="Favorite brands (comma separated)" value={favBrands} onChange={(e) => setFavBrands(e.target.value)} className="mb-2" />
        <Textarea placeholder="Other notes..." value={prefNotes} onChange={(e) => setPrefNotes(e.target.value)} />
      </div>
      <Button
        onClick={isEdit ? handleUpdate : handleCreate}
        disabled={!name.trim() || !relationship || (isEdit ? updateMember.isPending : createMember.isPending)}
        className="w-full"
      >
        {isEdit ? (updateMember.isPending ? "Updating..." : "Update") : (createMember.isPending ? "Adding..." : "Add Family Member")}
      </Button>
    </div>
  );

  const getInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const getAvatarColor = (n: string) => {
    const colors = ["bg-[#2AAFA9]/20 text-[#2AAFA9]", "bg-[#E8624A]/20 text-[#E8624A]", "bg-[#D4A017]/20 text-[#D4A017]", "bg-[#8B5CF6]/20 text-[#8B5CF6]", "bg-[#4F7EC4]/20 text-[#4F7EC4]"];
    return colors[n.length % colors.length];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Family</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage family profiles, sizes, and preferences</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Member</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Family Member</DialogTitle></DialogHeader>
            <MemberForm isEdit={false} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Family Member</DialogTitle></DialogHeader>
          <MemberForm isEdit={true} />
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : !members || members.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No family members added yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your family to personalize shopping recommendations</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.map((member) => {
            const sizes = (member.clothingSizes || {}) as ClothingSizes;
            const dietArr = (member.dietaryRestrictions || []) as string[];
            const prefs = (member.preferences || {}) as Preferences;
            return (
              <Card key={member.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className={`h-12 w-12 ${getAvatarColor(member.name)}`}>
                        <AvatarFallback className="text-sm font-semibold bg-transparent">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{member.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[10px]">{member.relationship}</Badge>
                          {member.birthDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Cake className="h-3 w-3" /> {member.birthDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(member)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteMember.mutate({ id: member.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(sizes.top || sizes.bottom || sizes.shoe || sizes.dress) && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1"><Shirt className="h-3 w-3" /> Sizes</p>
                      <div className="flex gap-2 flex-wrap">
                        {sizes.top && <Badge variant="outline" className="text-xs">Top: {sizes.top}</Badge>}
                        {sizes.bottom && <Badge variant="outline" className="text-xs">Bottom: {sizes.bottom}</Badge>}
                        {sizes.shoe && <Badge variant="outline" className="text-xs">Shoe: {sizes.shoe}</Badge>}
                        {sizes.dress && <Badge variant="outline" className="text-xs">Dress: {sizes.dress}</Badge>}
                      </div>
                    </div>
                  )}
                  {dietArr.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1"><UtensilsCrossed className="h-3 w-3" /> Dietary</p>
                      <div className="flex gap-1 flex-wrap">
                        {dietArr.map((d, i) => <Badge key={i} variant="secondary" className="text-xs">{d}</Badge>)}
                      </div>
                    </div>
                  )}
                  {((prefs.favoriteColors && prefs.favoriteColors.length > 0) || (prefs.brands && prefs.brands.length > 0)) && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1"><Heart className="h-3 w-3" /> Preferences</p>
                      <div className="flex gap-1 flex-wrap">
                        {prefs.favoriteColors?.map((c, i) => <Badge key={`c-${i}`} variant="outline" className="text-xs">🎨 {c}</Badge>)}
                        {prefs.brands?.map((b, i) => <Badge key={`b-${i}`} variant="outline" className="text-xs">🏷️ {b}</Badge>)}
                      </div>
                    </div>
                  )}
                  {prefs.notes && <p className="text-xs text-muted-foreground italic">{prefs.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
