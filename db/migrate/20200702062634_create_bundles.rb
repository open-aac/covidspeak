class CreateBundles < ActiveRecord::Migration[5.2]
  def change
    create_table :bundles do |t|
      t.text :settings
      t.string :verifier
      t.timestamps
    end
  end
end
